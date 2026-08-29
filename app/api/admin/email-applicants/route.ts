import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { sendBatch } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { getAllowance, getOptOuts, unsubscribeUrlFor, logSends } from "@/lib/emailAllowance";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Email a selected set of applicants.
 *
 * Deliberately takes explicit application IDs rather than a filter definition:
 * whoever sends must have SEEN the list they are emailing. Passing a filter
 * server-side risks the set having changed since it was reviewed.
 */
/** What is left of today's allowance — shown before anyone composes. */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles")
    .select("role, permissions").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  return NextResponse.json(await getAllowance(admin));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles")
    .select("role, full_name, permissions").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  /**
   * Employers reach this route for their own postings and hold no staff
   * capabilities, so they are checked by ownership further down instead.
   * Staff are checked by capability: a coordinator can review applicants
   * without being able to email hundreds of them.
   */
  if (["admin", "recruiter"].includes(me?.role ?? "") && !can(me, "applicants.contact"))
    return NextResponse.json({
      error: "You don't have permission to email applicants. Ask an administrator for contact access."
    }, { status: 403 });

  const { application_ids, subject, body, job_id } = await request.json();
  const ids: string[] = Array.isArray(application_ids) ? application_ids.filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one applicant." }, { status: 400 });
  if (!subject?.trim() || !body?.trim())
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  if (ids.length > 300)
    return NextResponse.json({ error: "That's more than 300 recipients — narrow the filter first." }, { status: 400 });

  const { data: apps } = await admin.from("applications")
    .select("id, talent_id, guest_name, guest_email, job_id").in("id", ids);
  if (!apps?.length) return NextResponse.json({ error: "No applicants found." }, { status: 404 });

  // An employer may only email applicants to their own postings.
  if (me?.role === "employer") {
    const jobIds = Array.from(new Set(apps.map((a: any) => a.job_id)));
    const { data: owned } = await admin.from("jobs")
      .select("id").in("id", jobIds).eq("created_by", user.id);
    const ownedIds = new Set((owned ?? []).map((j: any) => j.id));
    if (apps.some((a: any) => !ownedIds.has(a.job_id)))
      return NextResponse.json({ error: "Some of those applicants aren't on your postings." }, { status: 403 });
  }

  const { data: job } = job_id
    ? await admin.from("jobs").select("title").eq("id", job_id).maybeSingle()
    : { data: null };

  // Resolve a name and address for each, members and guests alike.
  const recipients: { email: string; name: string }[] = [];
  for (const a of apps as any[]) {
    if (a.talent_id) {
      const { data: p } = await admin.from("profiles")
        .select("full_name, email").eq("id", a.talent_id).maybeSingle();
      if (p?.email) recipients.push({ email: p.email, name: p.full_name ?? "there" });
    } else if (a.guest_email) {
      recipients.push({ email: a.guest_email, name: a.guest_name ?? "there" });
    }
  }
  if (!recipients.length)
    return NextResponse.json({ error: "None of those applicants have an email address on file." }, { status: 400 });

  // Never email someone who has opted out. Ignoring this is what turns a
  // provider account into a blocked one.
  const optedOut = await getOptOuts(admin, recipients.map((r) => r.email));
  const allowed = recipients.filter((r) => !optedOut.has(r.email.toLowerCase()));
  const skippedOptOut = recipients.length - allowed.length;

  if (!allowed.length)
    return NextResponse.json({
      error: `All ${recipients.length} of those recipients have unsubscribed, so nothing was sent.`
    }, { status: 400 });

  /**
   * The daily allowance, enforced BEFORE sending rather than discovered
   * afterwards. Previously a click could spend the whole day's quota and
   * leave application receipts and answer requests failing silently.
   */
  const allowance = await getAllowance(admin);
  if (allowance.remaining <= 0)
    return NextResponse.json({
      error: `Today's send allowance is used up — ${allowance.sent_today} of ${allowance.cap} sent. It resets at midnight. Nothing was sent, so nobody has been contacted twice.`,
      allowance
    }, { status: 429 });

  const willSend = allowed.slice(0, allowance.remaining);
  const deferred = allowed.length - willSend.length;

  // Personalise the greeting; everything else is what the sender wrote.
  // Each recipient gets their OWN unsubscribe link — the old header pointed
  // every recipient at /portal/account, which guest applicants cannot reach.
  const emails = await Promise.all(willSend.map(async (r) => ({
    to: r.email,
    subject: subject.trim(),
    unsubscribeUrl: await unsubscribeUrlFor(admin, r.email),
    html: renderEmail({
      kicker: job?.title ? `Regarding: ${job.title}` : "An update on your application",
      heading: subject.trim(),
      paragraphs: [
        `Hi ${r.name.split(" ")[0]},`,
        ...body.split(/\n{2,}/).map((s: string) => s.trim()).filter(Boolean),
        me?.full_name ? `— ${me.full_name}, MYJOBHACK` : "— MYJOBHACK"
      ]
    })
  })));

  // Paced, since this is bulk mail to a filtered segment.
  const results = await sendBatch(emails, { bulk: true, chunkSize: 20, pauseMs: 1500 });
  const sent = results.filter((r) => !r.error).length;
  const failed = results.length - sent;

  // Record every send AND every failure. Without this there is no way to know
  // who has already been contacted after an interrupted batch.
  const appByEmail = new Map<string, any>();
  for (const a of apps as any[]) if (a.guest_email) appByEmail.set(a.guest_email.toLowerCase(), a);
  await logSends(admin, willSend.map((r, i) => ({
    recipient: r.email,
    subject: subject.trim(),
    kind: "bulk",
    job_id: job_id ?? null,
    application_id: appByEmail.get(r.email.toLowerCase())?.id ?? null,
    sent_by: user.id,
    status: results[i]?.error ? "failed" : "sent",
    error: results[i]?.error ?? null,
    preview: body.trim()
  })));

  const after = await getAllowance(admin);
  const notes: string[] = [];
  if (failed) notes.push(`${failed} failed`);
  if (skippedOptOut) notes.push(`${skippedOptOut} skipped — unsubscribed`);
  if (deferred) notes.push(`${deferred} not sent — today's allowance ran out, run this again tomorrow and they'll be next`);

  return NextResponse.json({
    ok: true, sent, failed, deferred, skipped_opt_out: skippedOptOut, allowance: after,
    message: `Sent to ${sent} applicant${sent === 1 ? "" : "s"}.` +
      (notes.length ? ` ${notes.join(". ")}.` : "") +
      ` ${after.remaining} of ${after.cap} left today.`
  });
}
