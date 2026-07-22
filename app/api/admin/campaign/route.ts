import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiJson } from "@/lib/gemini";
import { renderEmail } from "@/lib/email";
import { renderCampaign as renderStored, resolveAudience, dispatchCampaign } from "@/lib/campaigns";
import { sendBatch, sendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 60;

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: me } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  if (me?.role !== "admin") return { error: "Admin only" };
  return { user, email: me.email };
}

function renderCampaign(d: any) {
  return renderEmail({
    preheader: d.preheader,
    kicker: d.kicker || "From Myjobhack",
    heading: d.hook,
    paragraphs: [d.opening, ...(d.closing ? [d.closing] : [])].filter(Boolean),
    bullets: d.bullets ?? [],
    cta: { label: d.cta_label, url: d.cta_url },
    footNote: "You're receiving this as a MYJOBHACK member. Manage preferences in your portal."
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });
  const b = await request.json();

  // ---------- DRAFT ----------
  if (b.mode === "draft") {
    const prompt = `You are MYJOBHACK's marketing copywriter. MYJOBHACK is a workforce transformation platform for Africa (talent profiles, skill-matched training invites, verified certificates, auto-shortlisting jobs, AI career tools). Brand voice: confident, editorial, warm, zero corporate filler. Never invent statistics.

Write ONE marketing email in STRICT Inverted Pyramid structure:
1. HOOK — a compelling heading (max 8 words) that leads with the single most important thing.
2. IMMEDIATE VALUE — one short opening sentence (max 22 words), then 3-5 punchy bullets (each max 12 words) delivering concrete value. Short sentences. Built for mobile skimming.
3. ONE CTA — a single call to action, 2-4 words.

Campaign brief from the founder:
- What we're promoting: ${b.clues}
- Audience: ${b.audience_desc || "MYJOBHACK talent members"}
- Tone: ${b.tone || "confident and warm"}
- CTA should point to: ${b.cta_url || "https://app.myjobhack.co"}

Respond with ONLY this JSON:
{"subject": "inbox subject line, max 45 chars, no clickbait",
 "preheader": "preview line, max 80 chars, extends the subject",
 "kicker": "2-4 word uppercase-style label",
 "hook": "the heading",
 "opening": "one sentence of immediate value",
 "bullets": ["...", "...", "..."],
 "closing": "optional single short sentence creating gentle urgency, or empty string",
 "cta_label": "2-4 words",
 "cta_url": "${b.cta_url || "https://app.myjobhack.co"}"}`;
    const r = await geminiJson(prompt);
    if (!r.data?.hook) return NextResponse.json({
      error: `Draft failed. ${r.error ?? "The model returned an incomplete draft — add a few more clues and retry."}`
    }, { status: 500 });
    return NextResponse.json({ draft: r.data, html: renderCampaign(r.data) });
  }

  // ---------- PREVIEW (re-render edited draft) ----------
  if (b.mode === "preview") {
    return NextResponse.json({ html: renderCampaign(b.draft) });
  }

  // ---------- TEST SEND ----------
  if (b.mode === "test") {
    const res = await sendEmail(auth.email!, `[TEST] ${b.draft.subject}`, renderCampaign(b.draft));
    return NextResponse.json({ ok: !res.error, detail: res });
  }

  // ---------- SEND (immediate) ----------
  if (b.mode === "send") {
    const admin = createAdminClient();
    const emails = await resolveAudience(admin, b.audience, b.niche_id, b.email_list);
    if (emails.length === 0) return NextResponse.json({ error: "No recipients resolved." }, { status: 400 });

    const html = renderCampaign(b.draft);
    // Campaigns are bulk mail — they must carry List-Unsubscribe headers, or
    // Gmail will route them to Promotions (or worse).
    const results = await sendBatch(
      emails.map((to) => ({ to, subject: b.draft.subject, html })),
      { bulk: true }
    );
    const sent = results.filter((r) => !r.error).length;

    await admin.from("campaigns").insert({
      created_by: (auth as any).user.id, subject: b.draft.subject, draft: b.draft,
      audience: b.audience, niche_id: b.niche_id ?? null, email_list: b.email_list ?? null,
      status: "sent", sent_at: new Date().toISOString(),
      recipients: emails.length, sent_count: sent
    });
    await admin.from("activity_log").insert({
      actor_id: (auth as any).user.id, action: "Marketing campaign sent", entity: "campaign",
      meta: { subject: b.draft.subject, audience: b.audience, recipients: emails.length, sent }
    });
    return NextResponse.json({ ok: true, recipients: emails.length, sent, failed: emails.length - sent });
  }

  // ---------- SCHEDULE ----------
  if (b.mode === "schedule") {
    if (!b.draft?.hook || !b.draft?.subject)
      return NextResponse.json({ error: "Draft the email first." }, { status: 400 });
    const when = new Date(b.scheduled_at);
    if (!b.scheduled_at || isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000)
      return NextResponse.json({ error: "Pick a future date & time." }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin.from("campaigns").insert({
      created_by: (auth as any).user.id, subject: b.draft.subject, draft: b.draft,
      audience: b.audience, niche_id: b.niche_id ?? null, email_list: b.email_list ?? null,
      status: "scheduled", scheduled_at: when.toISOString()
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // ---------- CANCEL ----------
  if (b.mode === "cancel") {
    const admin = createAdminClient();
    await admin.from("campaigns").update({ status: "cancelled" }).eq("id", b.id).eq("status", "scheduled");
    return NextResponse.json({ ok: true });
  }

  // ---------- SEND NOW (a scheduled one) ----------
  if (b.mode === "send_now") {
    const admin = createAdminClient();
    const r = await dispatchCampaign(admin, b.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, sent: r.sent, recipients: r.recipients });
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
}
