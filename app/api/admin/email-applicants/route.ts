import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { routeMail, summariseRouting } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { renderApplicantTemplate, applicantVars, checkTokens, toParagraphs } from "@/lib/applicantEmail";
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

  const b = await request.json();
  const { application_ids, subject, body, job_id } = b;
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
    ? await admin.from("jobs").select("title, company_name").eq("id", job_id).maybeSingle()
    : { data: null };

  /**
   * Resolve each recipient's details, members and guests alike.
   *
   * Phone, location and stage come along because the message can reference
   * them. Fetching only name and email would silently leave {location}
   * unfilled in a template that used it.
   */
  type Recipient = {
    email: string; name: string; phone: string; location: string; status: string;
  };
  const recipients: Recipient[] = [];
  for (const a of apps as any[]) {
    const location = (a.answers as any)?._location ?? "";
    if (a.talent_id) {
      const { data: p } = await admin.from("profiles")
        .select("full_name, email, phone").eq("id", a.talent_id).maybeSingle();
      if (p?.email) recipients.push({
        email: p.email, name: p.full_name ?? "there",
        phone: p.phone ?? "", location, status: a.status ?? ""
      });
    } else if (a.guest_email) {
      recipients.push({
        email: a.guest_email, name: a.guest_name ?? "there",
        phone: a.guest_phone ?? "", location, status: a.status ?? ""
      });
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

  /**
   * Each recipient's copy is rendered from their own application, so one
   * message becomes N correct ones rather than N identical ones.
   *
   * Each also gets their OWN unsubscribe link. The old header pointed every
   * recipient at /portal/account, which guest applicants cannot reach.
   */
  const detail = String(b.detail ?? "");
  const senderName = me?.full_name ? `${me.full_name}, MYJOBHACK` : "MYJOBHACK";

  /**
   * Preview renders the FIRST real recipient's copy and sends nothing.
   *
   * A preview built from placeholder values would not catch a token that
   * cannot be filled, and thirty people receiving "Hello {frist_name}" is
   * not recoverable.
   */
  if (b.preview) {
    const r0 = willSend[0];
    if (!r0) return NextResponse.json({ error: "Nobody to preview." }, { status: 400 });
    const v = applicantVars({
      name: r0.name, role: job?.title ?? "the role",
      company: job?.company_name ?? "MYJOBHACK",
      email: r0.email, phone: r0.phone, location: r0.location,
      stage: r0.status, sender: senderName, detail
    });
    const tokens = checkTokens(`${subject} ${body}`, v);
    return NextResponse.json({
      preview: {
        to: r0.email, name: r0.name,
        subject: renderApplicantTemplate(subject.trim(), v),
        body: renderApplicantTemplate(body, v)
      },
      recipients: willSend.length,
      deferred, skipped_opt_out: skippedOptOut,
      allowance,
      warnings: [
        ...(tokens.unknown.length
          ? [`Not recognised, and will appear as written: ${tokens.unknown.map((t) => "{" + t + "}").join(", ")}`] : []),
        ...(tokens.empty.length
          ? [`Empty for this recipient, and will appear as written: ${tokens.empty.map((t) => "{" + t + "}").join(", ")}`] : []),
        ...(deferred ? [`${deferred} will not be emailed today because the allowance runs out. Send again tomorrow.`] : []),
        ...(skippedOptOut ? [`${skippedOptOut} have unsubscribed and are excluded.`] : [])
      ]
    });
  }

  const emails = await Promise.all(willSend.map(async (r) => {
    const v = applicantVars({
      name: r.name, role: job?.title ?? "the role",
      company: job?.company_name ?? "MYJOBHACK",
      email: r.email, phone: r.phone ?? "", location: r.location ?? "",
      stage: r.status ?? "", sender: senderName, detail
    });
    const renderedSubject = renderApplicantTemplate(subject.trim(), v);
    return {
    to: r.email,
    subject: renderedSubject,
    unsubscribeUrl: await unsubscribeUrlFor(admin, r.email),
    html: renderEmail({
      kicker: job?.title ? `Regarding: ${job.title}` : "An update on your application",
      heading: renderedSubject,
      paragraphs: toParagraphs(renderApplicantTemplate(body, v))
    })
  };
  }));

  // Paced, since this is bulk mail to a filtered segment.
  const results = await routeMail(
    emails, { bulk: true, chunkSize: 20, pauseMs: 1500 }
  );
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
    provider: results[i]?.provider ?? "resend",
    preview: body.trim()
  })));

  const routing = summariseRouting(results);

  const after = await getAllowance(admin);
  const notes: string[] = [];
  if (failed) notes.push(`${failed} failed`);
  if (skippedOptOut) notes.push(`${skippedOptOut} skipped — unsubscribed`);
  if (deferred) notes.push(`${deferred} not sent — today's allowance ran out, run this again tomorrow and they'll be next`);

  return NextResponse.json({
    ok: true, sent, failed, deferred, skipped_opt_out: skippedOptOut, allowance: after,
    message: `Sent to ${sent} applicant${sent === 1 ? "" : "s"}.` +
      (routing.note ? ` ${routing.note}` : "") +
      (notes.length ? ` ${notes.join(". ")}.` : "") +
      ` ${after.remaining} of ${after.cap} left today.`,
    routing
  });
}
