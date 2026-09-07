import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { generateSlots, summarise, warnings, type SlotRules } from "@/lib/interviewSlots";
import { getAllowance, getOptOuts, unsubscribeUrlFor, logSends } from "@/lib/emailAllowance";
import { sendBatch } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { renderTemplate, toParagraphs, varsFor, unknownTokens, emptyTokens,
         DEFAULT_SUBJECT, DEFAULT_BODY } from "@/lib/interviewEmail";

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
  /**
   * Replace mode: these candidates already have an interview and this run
   * corrects it. Their existing interviews are cancelled rather than deleted,
   * so the earlier invitation stays on record, and their old slots are freed
   * for reuse. Interviews belonging to anyone NOT in this batch are left
   * alone, so a correction for some people cannot move everyone else.
   */
  const replace = !!body.replace;

  if (!ids.length)
    return NextResponse.json({ error: "Select the candidates to invite first." }, { status: 400 });

  const rules: SlotRules = {
    start_date: String(body.rules?.start_date ?? ""),
    end_date: body.rules?.end_date ? String(body.rules.end_date) : null,
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
  if (rules.end_date && rules.end_date < rules.start_date)
    return NextResponse.json({ error: "The end date cannot be before the start date." }, { status: 400 });

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

  /**
   * Times already booked for this job, so the new batch works around them
   * instead of colliding. Cancelled interviews free their slot again, which
   * matches the partial index in the database.
   */
  const notes: string[] = [];

  const { data: existing } = await admin.from("interviews")
    .select("id, application_id, scheduled_at, status").eq("job_id", apps[0].job_id)
    .not("scheduled_at", "is", null).neq("status", "cancelled");

  const inBatch = new Set(ids);
  const mine = (existing ?? []).filter((iv: any) => inBatch.has(iv.application_id));
  const others = (existing ?? []).filter((iv: any) => !inBatch.has(iv.application_id));

  // In replace mode this batch's own slots are up for grabs again. Otherwise
  // every existing interview blocks its time.
  const blocking = replace ? others : (existing ?? []);
  const taken = new Set(blocking
    .map((iv: any) => new Date(iv.scheduled_at).getTime())
    .filter((n: number) => !Number.isNaN(n)));

  const replacing = replace ? mine.length : 0;

  const slots = generateSlots(invitable.length, rules, taken);
  if (taken.size)
    notes.push(`${taken.size} time${taken.size === 1 ? " is" : "s are"} booked by other candidates on this job and ${taken.size === 1 ? "was" : "were"} skipped.`);
  if (replace && replacing)
    notes.push(`${replacing} existing interview${replacing === 1 ? "" : "s"} for these candidates will be cancelled and replaced. Each person receives a fresh invitation with their new time.`);
  if (replace && !replacing)
    notes.push("None of these candidates currently has an interview, so nothing will be replaced. This will behave as a normal invitation.");
  if (!replace && mine.length)
    notes.push(`${mine.length} of these candidates already ${mine.length === 1 ? "has an interview" : "have interviews"}. Tick "replace" if this run is a correction, or they will end up with two.`);
  const schedule = invitable.slice(0, slots.length).map((p, i) => ({
    ...p, slot: slots[i].start.toISOString(), label: slots[i].label
  }));

  const allowance = await getAllowance(admin);
  notes.push(...warnings(invitable.length, slots, rules));
  if (missingEmail) notes.push(`${missingEmail} applicant(s) have no email address and cannot be invited.`);
  if (skippedOptOut) notes.push(`${skippedOptOut} have unsubscribed and were left out.`);
  if (schedule.length > allowance.remaining)
    notes.push(`Only ${allowance.remaining} emails remain in today's allowance. The rest will need to go out tomorrow.`);

  const subjectTpl = String(body.subject_template ?? DEFAULT_SUBJECT);
  const bodyTpl = String(body.body_template ?? DEFAULT_BODY);
  const { data: jobRow } = await admin.from("jobs")
    .select("title, company_name").eq("id", apps[0].job_id).maybeSingle();

  if (preview) {
    /**
     * Render the email exactly as the FIRST candidate will receive it, using
     * their real slot. A preview built from placeholder values would not
     * catch a broken token or a dangling "Where:" line, which is the whole
     * reason for previewing.
     */
    let sample = null as any;
    if (schedule.length) {
      const v = varsFor({
        name: schedule[0].name, role: jobRow?.title ?? "the role",
        company: jobRow?.company_name ?? "MYJOBHACK",
        slotIso: schedule[0].slot, duration: rules.slot_minutes,
        location: String(body.location_or_link ?? ""),
        timezone: rules.timezone || "Africa/Lagos"
      });
      sample = {
        to: schedule[0].email,
        name: schedule[0].name,
        subject: renderTemplate(subjectTpl, v),
        body: renderTemplate(bodyTpl, v),
        unknown_tokens: unknownTokens(bodyTpl + " " + subjectTpl, v),
        empty_tokens: emptyTokens(bodyTpl + " " + subjectTpl, v)
      };
      if (sample.unknown_tokens.length)
        notes.push(`These tokens are not recognised and will appear as written: ${sample.unknown_tokens.map((t: string) => "{" + t + "}").join(", ")}`);
      if (sample.empty_tokens.length)
        notes.push(`These tokens have no value for this batch and will be left as written: ${sample.empty_tokens.map((t: string) => "{" + t + "}").join(", ")}`);
    }

    return NextResponse.json({
      schedule: schedule.map((s) => ({ name: s.name, email: s.email, label: s.label, slot: s.slot })),
      summary: summarise(slots, rules.timezone || "Africa/Lagos"), notes, allowance, count: schedule.length, sample
    });
  }

  if (!schedule.length)
    return NextResponse.json({ error: "No candidates could be scheduled. Check the notes and try again." }, { status: 400 });

  // ---- commit ----
  /**
   * Cancel before inserting, so the freed slots are actually free when the
   * unique index checks them. Cancelled rows keep the history of what was
   * originally sent, which matters when a candidate turns up quoting the
   * first email.
   */
  if (replace && mine.length) {
    const { error: cancelErr } = await admin.from("interviews")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("id", mine.map((iv: any) => iv.id));
    if (cancelErr)
      return NextResponse.json({
        error: `Could not cancel the earlier interviews, so nothing was changed: ${cancelErr.message}`
      }, { status: 500 });
  }

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
    // Stored so the list, the email and any export all render the same time.
    timezone: rules.timezone || "Africa/Lagos",
    status: "invited"
  }));

  const { error: ivErr } = await admin.from("interviews").insert(rows);
  if (ivErr) {
    const guestBlocked = /talent_id/i.test(ivErr.message) && /null/i.test(ivErr.message);
    const clash = /interviews_no_double_booking|duplicate key/i.test(ivErr.message);
    return NextResponse.json({
      error: guestBlocked
        ? "Guest applicants cannot be scheduled until migration 0051_bulk_interviews.sql is run, which allows interviews without a profile."
        : clash
        ? "Some of these times are already booked for this job, so nothing was saved. Preview again and the booked times will be skipped, or cancel the earlier interviews first."
        : `Could not save the interviews: ${ivErr.message}`
    }, { status: 400 });
  }

  // ---- invitations ----
  const emails = await Promise.all(sendable.map(async (s) => {
    const v = varsFor({
      name: s.name, role: jobRow?.title ?? "the role",
      company: jobRow?.company_name ?? "MYJOBHACK",
      slotIso: s.slot, duration: rules.slot_minutes,
      location: String(body.location_or_link ?? ""),
      timezone: rules.timezone || "Africa/Lagos"
    });
    return {
      to: s.email,
      subject: renderTemplate(subjectTpl, v),
      unsubscribeUrl: await unsubscribeUrlFor(admin, s.email),
      html: renderEmail({
        preheader: `Your interview is ${v.day_and_time}`,
        kicker: "Interview invitation",
        heading: `${v.first_name}, we would like to meet you`,
        // The recruiter's own words, split into paragraphs on blank lines.
        paragraphs: toParagraphs(renderTemplate(bodyTpl, v))
      })
    };
  }));

  const results = await sendBatch(emails.map(({ to, subject, html }) => ({ to, subject, html })),
    { bulk: false, chunkSize: 10, pauseMs: 1200 });

  const sent = results.filter((r) => !r.error).length;
  await logSends(admin, sendable.map((s, i) => ({
    recipient: s.email, subject: `Interview invitation: ${jobRow?.title ?? ""}`,
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
    message: (replacing ? `Replaced ${replacing} earlier interview${replacing === 1 ? "" : "s"}. ` : "") +
      `Scheduled ${rows.length} interview${rows.length === 1 ? "" : "s"} and sent ${sent} invitation${sent === 1 ? "" : "s"}.` +
      (deferred ? ` ${deferred} could not be emailed today because the daily allowance ran out. The interviews are saved, so resend tomorrow.` : "") +
      (skippedOptOut ? ` ${skippedOptOut} skipped, unsubscribed.` : "")
  });
}
