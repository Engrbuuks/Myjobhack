import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { generateSlots, summarise, warnings, type SlotRules } from "@/lib/interviewSlots";
import { getAllowance, getOptOuts, unsubscribeUrlFor, logSends } from "@/lib/emailAllowance";
import { sendBatch } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Invite a batch of candidates to interview, each at their own time.
 *
 * POST { application_ids, rules, mode, location_or_link, message, preview }
 *
 * `preview: true` returns the proposed schedule WITHOUT writing or sending
 * anything. That is deliberate: thirty three invitations cannot be recalled,
 * so the schedule is reviewed first and only then committed.
 */
export async function POST(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const body = await request.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(body.application_ids) ? body.application_ids : [];
  const preview = !!body.preview;

  if (!ids.length)
    return NextResponse.json({ error: "Select the candidates to invite first." }, { status: 400 });

  const rules: SlotRules = {
    start_date: String(body.rules?.start_date ?? ""),
    day_start: String(body.rules?.day_start ?? "09:00"),
    day_end: String(body.rules?.day_end ?? "17:00"),
    slot_minutes: Number(body.rules?.slot_minutes) || 30,
    gap_minutes: Number(body.rules?.gap_minutes) || 0,
    break_start: body.rules?.break_start || null,
    break_end: body.rules?.break_end || null,
    weekdays: Array.isArray(body.rules?.weekdays) ? body.rules.weekdays : undefined,
    timezone: body.rules?.timezone || "Africa/Lagos"
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rules.start_date))
    return NextResponse.json({ error: "Choose the date interviews should start." }, { status: 400 });

  // Candidates, in a stable order so the preview matches what is committed.
  const { data: apps } = await admin.from("applications")
    .select("id, job_id, talent_id, guest_name, guest_email, created_at")
    .in("id", ids).order("created_at");
  if (!apps?.length)
    return NextResponse.json({ error: "Those applications no longer exist." }, { status: 404 });

  const talentIds = apps.map((a: any) => a.talent_id).filter(Boolean);
  const { data: profs } = talentIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", talentIds)
    : { data: [] as any[] };
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));

  const people = apps.map((a: any) => {
    const p = a.talent_id ? profById.get(a.talent_id) : null;
    return {
      application_id: a.id, job_id: a.job_id, talent_id: a.talent_id,
      name: p?.full_name ?? a.guest_name ?? "Candidate",
      email: p?.email ?? a.guest_email ?? ""
    };
  }).filter((p) => p.email);

  const missingEmail = apps.length - people.length;

  // Anyone who has unsubscribed is dropped before slots are allocated, so the
  // schedule has no gaps where a skipped person would have been.
  const optedOut = await getOptOuts(admin, people.map((p) => p.email));
  const invitable = people.filter((p) => !optedOut.has(p.email.toLowerCase()));
  const skippedOptOut = people.length - invitable.length;

  const slots = generateSlots(invitable.length, rules);
  const schedule = invitable.slice(0, slots.length).map((p, i) => ({
    ...p, slot: slots[i].start.toISOString(), label: slots[i].label
  }));

  const allowance = await getAllowance(admin);
  const notes = warnings(invitable.length, slots, rules);
  if (missingEmail) notes.push(`${missingEmail} applicant(s) have no email address and cannot be invited.`);
  if (skippedOptOut) notes.push(`${skippedOptOut} have unsubscribed and were left out.`);
  if (schedule.length > allowance.remaining)
    notes.push(`Only ${allowance.remaining} emails remain in today's allowance. The rest will need to go out tomorrow.`);

  if (preview) {
    return NextResponse.json({
      schedule: schedule.map((s) => ({ name: s.name, email: s.email, label: s.label, slot: s.slot })),
      summary: summarise(slots), notes, allowance, count: schedule.length
    });
  }

  if (!schedule.length)
    return NextResponse.json({ error: "No candidates could be scheduled. Check the notes and try again." }, { status: 400 });

  // ---- commit ----
  const { data: batch, error: batchErr } = await admin.from("interview_batches").insert({
    job_id: schedule[0].job_id, created_by: gate.userId,
    slot_minutes: rules.slot_minutes, gap_minutes: rules.gap_minutes,
    day_start: rules.day_start, day_end: rules.day_end,
    timezone: rules.timezone || "Africa/Lagos",
    mode: String(body.mode ?? "video"),
    location_or_link: String(body.location_or_link ?? ""),
    message: String(body.message ?? ""),
    invited_count: schedule.length
  }).select("id").single();

  if (batchErr) {
    const missing = /relation .* does not exist|could not find the table/i.test(batchErr.message);
    return NextResponse.json({
      error: missing
        ? "The interview_batches table doesn't exist yet. Run migration 0051_bulk_interviews.sql in the Supabase SQL editor."
        : batchErr.message
    }, { status: missing ? 400 : 500 });
  }

  const { data: job } = await admin.from("jobs").select("title").eq("id", schedule[0].job_id).single();
  const sendable = schedule.slice(0, allowance.remaining);

  const rows = sendable.map((s) => ({
    application_id: s.application_id, job_id: s.job_id, talent_id: s.talent_id,
    guest_name: s.talent_id ? null : s.name,
    guest_email: s.talent_id ? null : s.email,
    scheduled_by: gate.userId, batch_id: batch.id,
    mode: String(body.mode ?? "video"),
    scheduled_at: s.slot, duration_min: rules.slot_minutes,
    location_or_link: String(body.location_or_link ?? ""),
    message: String(body.message ?? ""),
    status: "invited"
  }));

  const { error: ivErr } = await admin.from("interviews").insert(rows);
  if (ivErr) {
    const guestBlocked = /talent_id/i.test(ivErr.message) && /null/i.test(ivErr.message);
    return NextResponse.json({
      error: guestBlocked
        ? "Guest applicants cannot be scheduled until migration 0051_bulk_interviews.sql is run, which allows interviews without a profile."
        : `Could not save the interviews: ${ivErr.message}`
    }, { status: 400 });
  }

  // ---- invitations ----
  const emails = await Promise.all(sendable.map(async (s) => {
    const when = new Date(s.slot).toLocaleString("en-GB", {
      weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit", hour12: false
    });
    return {
      to: s.email,
      subject: `Interview invitation: ${job?.title ?? "your application"}`,
      unsubscribeUrl: await unsubscribeUrlFor(admin, s.email),
      html: renderEmail({
        preheader: `Your interview is ${when}`,
        kicker: "Interview invitation",
        heading: `${s.name.split(" ")[0]}, we would like to meet you`,
        paragraphs: [
          `Thank you for applying for ${job?.title ?? "the role"}. We would like to invite you to an interview.`,
          `Your time: ${when} (${rules.timezone}). Please allow ${rules.slot_minutes} minutes.`,
          body.location_or_link ? `Where: ${body.location_or_link}` : "",
          body.message ? String(body.message) : "",
          "If this time does not work, reply to this email and we will find another."
        ].filter(Boolean)
      })
    };
  }));

  const results = await sendBatch(emails.map(({ to, subject, html }) => ({ to, subject, html })),
    { bulk: false, chunkSize: 10, pauseMs: 1200 });

  const sent = results.filter((r) => !r.error).length;
  await logSends(admin, sendable.map((s, i) => ({
    recipient: s.email, subject: `Interview invitation: ${job?.title ?? ""}`,
    kind: "bulk", job_id: s.job_id, application_id: s.application_id,
    sent_by: gate.userId,
    status: results[i]?.error ? "failed" : "sent",
    error: results[i]?.error ?? null,
    preview: `Interview ${s.label}`
  })));

  // Move everyone invited into the interviewing stage.
  await admin.from("applications").update({ status: "interviewing" })
    .in("id", sendable.map((s) => s.application_id));

  const deferred = schedule.length - sendable.length;
  return NextResponse.json({
    ok: true, sent, batch_id: batch.id, deferred,
    message: `Scheduled ${rows.length} interview${rows.length === 1 ? "" : "s"} and sent ${sent} invitation${sent === 1 ? "" : "s"}.` +
      (deferred ? ` ${deferred} could not be emailed today because the daily allowance ran out. The interviews are saved, so resend tomorrow.` : "") +
      (skippedOptOut ? ` ${skippedOptOut} skipped, unsubscribed.` : "")
  });
}
