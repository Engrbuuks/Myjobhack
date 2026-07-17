import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiJson } from "@/lib/gemini";
import { renderEmail } from "@/lib/email";
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
    if (!r.data?.hook) return NextResponse.json({ error: "Draft failed — try again or add more clues." }, { status: 500 });
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

  // ---------- SEND ----------
  if (b.mode === "send") {
    const admin = createAdminClient();
    let emails: string[] = [];
    if (b.audience === "all_talent") {
      const { data } = await admin.from("profiles").select("email").in("role", ["job_seeker", "elite_member"]);
      emails = (data ?? []).map((p) => p.email).filter(Boolean);
    } else if (b.audience === "elite") {
      const { data } = await admin.from("profiles").select("email").eq("role", "elite_member");
      emails = (data ?? []).map((p) => p.email).filter(Boolean);
    } else if (b.audience === "niche" && b.niche_id) {
      const { data: tps } = await admin.from("talent_profiles").select("profile_id").eq("niche_id", b.niche_id);
      const ids = (tps ?? []).map((t) => t.profile_id);
      if (ids.length) {
        const { data } = await admin.from("profiles").select("email").in("id", ids);
        emails = (data ?? []).map((p) => p.email).filter(Boolean);
      }
    } else if (b.audience === "list") {
      emails = String(b.email_list ?? "").split(/[\s,;]+/).filter((e: string) => e.includes("@"));
    }
    emails = Array.from(new Set(emails));
    if (emails.length === 0) return NextResponse.json({ error: "No recipients resolved." }, { status: 400 });

    const html = renderCampaign(b.draft);
    const results = await sendBatch(emails.map((to) => ({ to, subject: b.draft.subject, html })));
    const sent = results.filter((r) => !r.error).length;

    await admin.from("activity_log").insert({
      actor_id: (auth as any).user.id, action: "Marketing campaign sent", entity: "campaign",
      meta: { subject: b.draft.subject, audience: b.audience, recipients: emails.length, sent }
    });
    return NextResponse.json({ ok: true, recipients: emails.length, sent, failed: emails.length - sent });
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
}
