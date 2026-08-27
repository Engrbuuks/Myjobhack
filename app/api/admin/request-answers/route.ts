import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { makeToken } from "@/lib/resumeScan";

export const runtime = "nodejs";
export const maxDuration = 300;

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Ask applicants who skipped a question to answer it — in one tap.
 * POST { job_id, field_id, limit?, daily_cap? }
 *
 * WHY NOT JUST ASK THEM TO REPLY: a reply lands in a human inbox and has to be
 * read, matched to an application and typed in by hand. At 100+ applicants
 * that is a day's work and it introduces transcription errors. Instead each
 * person gets their own tokenised link per option — they tap "Ibadan", it
 * writes straight into their application. Nothing to read, nothing to type.
 *
 * GET returns how many are missing an answer and how much send quota is left
 * today, so you can plan around a free-tier limit before sending anything.
 */

async function gate(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin };
}

/** How many were sent since midnight — the free tier resets daily. */
async function sentToday(admin: any): Promise<number> {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const { count } = await admin.from("answer_requests")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", midnight.toISOString());
  return count ?? 0;
}

export async function GET(request: Request) {
  const g = await gate(request); if ("error" in g) return g.error;
  const admin = g.admin;
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job_id");
  const fieldId = searchParams.get("field_id");
  if (!jobId || !fieldId) return NextResponse.json({ error: "job_id and field_id are required" }, { status: 400 });

  const { data: apps } = await admin.from("applications")
    .select("id, answers, talent_id, guest_email").eq("job_id", jobId);
  const missing = (apps ?? []).filter((a: any) => {
    const v = (a.answers ?? {})[fieldId];
    return v == null || v === "" || (Array.isArray(v) && v.length === 0);
  });

  const { data: reqs } = await admin.from("answer_requests")
    .select("id, answered_at, sent_at").eq("job_id", jobId).eq("field_id", fieldId);

  const used = await sentToday(admin);
  return NextResponse.json({
    missing_answer: missing.length,
    already_asked: (reqs ?? []).filter((r: any) => r.sent_at).length,
    replied: (reqs ?? []).filter((r: any) => r.answered_at).length,
    sent_today: used,
    remaining_today: Math.max(0, 90 - used)
  });
}

export async function POST(request: Request) {
  const g = await gate(request); if ("error" in g) return g.error;
  const admin = g.admin;

  const body = await request.json().catch(() => ({}));
  const jobId = body.job_id as string | undefined;
  const fieldId = body.field_id as string | undefined;
  // Default 90, not 100: Resend's free tier allows 100 messages a day across
  // the whole account, and the app sends application receipts and invites too.
  // Spending the entire allowance here would silently break those.
  const dailyCap = Math.min(Number(body.daily_cap) || 90, 100);
  const limit = Math.min(Number(body.limit) || 50, 100);

  if (!jobId || !fieldId)
    return NextResponse.json({ error: "job_id and field_id are required" }, { status: 400 });

  const { data: job } = await admin.from("jobs").select("id, title, form_id").eq("id", jobId).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data: field } = await admin.from("form_fields")
    .select("id, label, field_type, options").eq("id", fieldId).maybeSingle();
  if (!field) return NextResponse.json({ error: "That question is no longer on the form." }, { status: 404 });

  const options: string[] = Array.isArray(field.options) ? field.options : [];
  if (!options.length)
    return NextResponse.json({
      error: "One-click answers need a question with fixed options (a select or multiselect). A free-text question can't be answered from an email button."
    }, { status: 400 });

  const used = await sentToday(admin);
  const budget = Math.max(0, dailyCap - used);
  if (budget === 0)
    return NextResponse.json({
      error: `Today's send allowance is used up (${used} already sent). Resend's free tier resets at midnight UTC — run this again tomorrow and it will pick up where it stopped.`
    }, { status: 429 });

  // Who is still missing an answer, and who has already been asked?
  const { data: apps } = await admin.from("applications")
    .select("id, answers, talent_id, guest_email, guest_name").eq("job_id", jobId);

  const { data: existing } = await admin.from("answer_requests")
    .select("application_id, sent_at").eq("job_id", jobId).eq("field_id", fieldId);
  const asked = new Set((existing ?? []).filter((r: any) => r.sent_at).map((r: any) => r.application_id));

  const candidates = (apps ?? []).filter((a: any) => {
    const v = (a.answers ?? {})[fieldId];
    const blank = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    return blank && !asked.has(a.id);          // never ask the same person twice
  }).slice(0, Math.min(limit, budget));

  if (!candidates.length)
    return NextResponse.json({ message: "Everyone on this job has either answered or already been asked.", sent: 0, remaining_today: budget });

  // Resolve names and emails.
  const talentIds = candidates.map((a: any) => a.talent_id).filter(Boolean);
  const { data: profs } = talentIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", talentIds)
    : { data: [] as any[] };
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));

  const toSend: { to: string; subject: string; html: string; appId: string; token: string }[] = [];

  for (const a of candidates) {
    const prof = a.talent_id ? profById.get(a.talent_id) : null;
    const email = prof?.email ?? a.guest_email;
    const name = (prof?.full_name ?? a.guest_name ?? "there").split(" ")[0];
    if (!email) continue;

    const token = makeToken();
    // Record before sending, so a send failure leaves a row we can retry
    // rather than a token that exists only inside a delivered email.
    const { error: insErr } = await admin.from("answer_requests").upsert({
      application_id: a.id, job_id: jobId, field_id: fieldId,
      question: field.label, options, token
    }, { onConflict: "application_id,field_id" });
    if (insErr) continue;

    const buttons = options.map((o) =>
      `<a href="${APP()}/a/${token}?v=${encodeURIComponent(o)}" style="display:inline-block;margin:0 8px 10px 0;padding:12px 22px;border-radius:999px;background:#FC5647;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none">${o}</a>`
    ).join("");

    const html = renderEmail({
      preheader: `One tap to finish your application for ${job.title}`,
      kicker: "One quick thing",
      heading: `${name}, one question left on your application`,
      paragraphs: [
        `Thanks for applying for ${job.title}. We're missing one answer, and it affects how we shortlist.`,
        field.label,
        "Tap your answer below — it takes one tap and there's nothing to type or sign in to."
      ]
    }).replace("</body>", `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:0 24px 34px">${buttons}
          <p style="margin:14px 0 0;color:#7C9694;font-family:Arial,Helvetica,sans-serif;font-size:12px">
            If the buttons don't work, open ${APP()}/a/${token}
          </p>
        </td></tr>
      </table></body>`);

    toSend.push({ to: email, subject: `One question left — ${job.title}`, html, appId: a.id, token });
  }

  if (!toSend.length)
    return NextResponse.json({ message: "Nobody left to ask has a usable email address.", sent: 0 });

  const results = await sendBatch(
    toSend.map(({ to, subject, html }) => ({ to, subject, html })),
    { chunkSize: 10, pauseMs: 1200 }
  );

  let sent = 0, failed = 0;
  for (let i = 0; i < toSend.length; i++) {
    const r = results[i];
    if (r?.error) {
      failed++;
      await admin.from("answer_requests").update({ send_error: r.error }).eq("token", toSend[i].token);
    } else {
      sent++;
      await admin.from("answer_requests").update({ sent_at: new Date().toISOString() }).eq("token", toSend[i].token);
    }
  }

  const stillMissing = (apps ?? []).filter((a: any) => {
    const v = (a.answers ?? {})[fieldId];
    return (v == null || v === "" || (Array.isArray(v) && v.length === 0)) && !asked.has(a.id);
  }).length - sent;

  return NextResponse.json({
    message: `Asked ${sent} applicant${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}. ${
      stillMissing > 0
        ? `${stillMissing} still to ask — today's allowance is spent, so run this again tomorrow.`
        : "That's everyone."} Answers land in the application as people tap.`,
    sent, failed, still_missing: Math.max(0, stillMissing),
    remaining_today: Math.max(0, budget - sent)
  });
}
