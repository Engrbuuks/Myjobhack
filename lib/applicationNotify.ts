/**
 * What an applicant, and the hiring side, are told when an application lands.
 *
 * Both apply routes used to end in silence. The guest form tells people to
 * watch their inbox and nothing was ever sent to it, and the staff alert was
 * gated on job.org_id, which is null on every MYJOBHACK posting by design, so
 * applications to our own roles reached nobody at all.
 *
 * The copy lives here rather than in either route because the same two
 * messages go out from both of them, and wording written twice drifts apart.
 */
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { unsubscribeUrlFor, logSends } from "@/lib/emailAllowance";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Where the alert for a posting with no employer account behind it goes.
 *
 * OPS_NOTIFY_EMAIL is the intended home. RESEND_REPLY_TO is the fallback
 * because it is already configured, already a real inbox, and already the
 * address candidates reply to, so an alert there cannot go unread.
 */
export function opsEmail(): string {
  return process.env.OPS_NOTIFY_EMAIL || process.env.RESEND_REPLY_TO || "hello@myjobhack.co";
}

const firstNameOf = (name: string | null | undefined) =>
  String(name || "there").trim().split(/\s+/)[0] || "there";

const today = () =>
  new Date().toLocaleDateString("en-GB", {
    timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

export type ApplicationReceipt = {
  admin: any;
  to: string;
  name: string | null;
  role: string;
  company: string;
  jobId: string;
  applicationId: string;
  /** Null for a guest, which is most applicants. */
  profileId?: string | null;
  shortlisted?: boolean;
  /** A registered applicant has a page to watch. A guest has only the inbox. */
  canTrack?: boolean;
};

/**
 * Confirm to the applicant that their application arrived.
 *
 * Deliberately promises no date. The business cannot keep one, and a receipt
 * that invents "within 5 working days" is worse than no receipt at all: the
 * candidate waits on it and stops applying elsewhere.
 *
 * Never throws. An application that is already saved must not be reported as
 * failed because a mail provider was briefly down.
 */
export async function sendApplicationReceipt(
  r: ApplicationReceipt
): Promise<{ sent: boolean; error: string | null }> {
  const first = firstNameOf(r.name);
  const subject = `We have your application for ${r.role}`;

  const html = renderEmail({
    preheader: `Your application for ${r.role} reached the hiring team.`,
    kicker: "Application received",
    heading: "Your application is in.",
    paragraphs: [
      `Hello ${first}, thank you for applying for ${r.role} at ${r.company}. Your application and your CV reached us, and they are now with the hiring team.`,
      r.shortlisted
        ? "Your answers met the requirements set on this role, so the system shortlisted you straight away and the team sees your application near the top of the list. That is not an offer, and it is not a promise of an interview, but it is a good place to start."
        : "What happens next is that the team reads every application against what the role actually needs.",
      "If they decide to take things further, we will write to you at this same address. We cannot give you a date for that, so please do not hold anything on it. Keep applying for the other roles you want in the meantime.",
      "There is nothing you need to do now. If you did not apply for this role, you can safely ignore this message."
    ],
    details: [["Role", r.role], ["Company", r.company], ["Received", today()]],
    // A guest has no portal to send them to, so no button is honest. A
    // registered applicant can actually watch the stage change.
    cta: r.canTrack
      ? { label: "View my applications", url: `${APP()}/portal/seeker/applications` }
      : undefined,
    footNote: "We write about this application from this address only. If our next message does not arrive, please check your spam folder."
  });

  try {
    /**
     * The same per address token the bulk senders use. A guest has no account
     * page, so a token link is the only way they can ever stop mail from us,
     * and a recipient who cannot unsubscribe reports spam instead, which costs
     * the whole platform its deliverability.
     */
    const unsubscribeUrl = await unsubscribeUrlFor(r.admin, r.to);
    const [res] = await routeMail(
      [{ to: r.to, subject, html, unsubscribeUrl }],
      { bulk: false, unsubscribeUrl }
    );

    await logSends(r.admin, [{
      recipient: r.to, subject, kind: "transactional",
      job_id: r.jobId, application_id: r.applicationId, profile_id: r.profileId ?? null,
      status: res?.error ? "failed" : "sent",
      error: res?.error ?? null,
      provider: res?.provider ?? "resend",
      preview: `Application receipt: ${r.role}`
    }]).catch(() => {});

    return { sent: !res?.error, error: res?.error ?? null };
  } catch (err: any) {
    return { sent: false, error: err?.message ?? "receipt send failed" };
  }
}

export type StaffAlert = {
  admin: any;
  jobId: string;
  jobTitle: string;
  applicantName?: string | null;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  applicationId: string;
  shortlisted?: boolean;
};

/**
 * Tell our own team about an application to a first party posting.
 *
 * org_id is null on a MYJOBHACK job on purpose: there is no employer account
 * to notify. The old code read that as "nobody to tell" and sent nothing, so
 * our own postings were the only ones that collected applications in silence.
 *
 * Staff recipients are resolved the way the training interest route already
 * does it, from profiles.role, so there is one definition of who gets told.
 */
export async function notifyStaffOfApplication(
  a: StaffAlert
): Promise<{ notified: number; emailed: boolean; error: string | null }> {
  const link = `/portal/admin/jobs/${a.jobId}/applicants`;
  const who = a.applicantName || a.applicantEmail || "Someone";
  const body = `${who} applied to "${a.jobTitle}", one of our own postings${
    a.shortlisted ? ", and passed the rules on the form so it came in already shortlisted" : ""
  }.`;

  let notified = 0;
  try {
    const { data: staff } = await a.admin.from("profiles")
      .select("id, email").eq("role", "admin");
    for (const s of staff ?? []) {
      const { error } = await a.admin.from("notifications").insert({
        profile_id: s.id, title: "New application to a MYJOBHACK role 📥", body, link
      });
      if (!error) notified += 1;
    }
  } catch { /* the in app alert is best effort; the email below is the backstop */ }

  let emailed = false;
  let error: string | null = null;
  try {
    const to = opsEmail();
    const subject = `New application: ${a.jobTitle}`;
    const details: [string, string][] = [["Role", a.jobTitle]];
    if (a.applicantName) details.push(["Applicant", a.applicantName]);
    if (a.applicantEmail) details.push(["Email", a.applicantEmail]);
    if (a.applicantPhone) details.push(["Phone", a.applicantPhone]);
    details.push(["Status", a.shortlisted ? "Shortlisted by the rules" : "Submitted"]);
    details.push(["Received", today()]);

    const [res] = await routeMail([{
      to, subject,
      html: renderEmail({
        preheader: `${who} applied to ${a.jobTitle}.`,
        kicker: "New application",
        heading: "Someone applied to one of our roles.",
        paragraphs: [
          body,
          "This posting has no employer account behind it, so this message and the alert in the staff portal are the only notice anyone gets."
        ],
        details,
        cta: { label: "Open the applicant list", url: `${APP()}${link}` }
      })
    }], { bulk: false });

    emailed = !res?.error;
    error = res?.error ?? null;

    await logSends(a.admin, [{
      recipient: to, subject, kind: "transactional",
      job_id: a.jobId, application_id: a.applicationId,
      status: res?.error ? "failed" : "sent",
      error: res?.error ?? null,
      provider: res?.provider ?? "resend",
      preview: body
    }]).catch(() => {});
  } catch (err: any) {
    error = err?.message ?? "staff alert send failed";
  }

  return { notified, emailed, error };
}
