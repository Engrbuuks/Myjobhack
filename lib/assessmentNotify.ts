/**
 * Telling a candidate what happened to their assessment.
 *
 * Submitting says "your badge will appear shortly". Publishing the band was
 * then completely silent, so the only way to find out was to keep opening the
 * assessment page, which is the opposite of what shortly means.
 *
 * Assessment takers are registered by definition, so both channels are
 * available here: the in app notification and the email. Both are sent,
 * because the in app one is only seen by someone who comes back.
 */
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { logSends } from "@/lib/emailAllowance";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
const BADGE_LINK = "/portal/seeker/assessment";

/** confirmed and overridden come from the review desk, the rest from a live check. */
export type BandEvent = "confirmed" | "overridden" | "verified" | "withdrawn";

export type BandNotice = {
  admin: any;
  talentId: string;
  field: string;
  band: string | null;
  score: number | null;
  event: BandEvent;
  /** The reviewer's note, shared with the candidate only when one was written. */
  note?: string | null;
  reviewerId?: string | null;
};

const titleCase = (s: string | null | undefined) =>
  !s ? "" : s.charAt(0).toUpperCase() + s.slice(1);

const firstNameOf = (name: string | null | undefined) =>
  String(name || "there").trim().split(/\s+/)[0] || "there";

function copyFor(n: BandNotice, first: string): {
  subject: string; kicker: string; heading: string; preheader: string;
  paragraphs: string[]; inAppTitle: string; inAppBody: string;
} {
  const field = n.field || "your field";
  const band = titleCase(n.band);
  const scored = n.score != null ? `, with a score of ${n.score} out of 100` : "";

  if (n.event === "withdrawn") {
    return {
      subject: `An update on your competency band for ${field}`,
      kicker: "Assessment reviewed",
      heading: "Your competency band has been withdrawn.",
      preheader: "The band has been removed from your profile.",
      paragraphs: [
        `Hello ${first}, we have finished the live check on your assessment in ${field}.`,
        "We were not able to confirm that the answers were your own work, so the competency band has been removed from your profile. Nothing else about your profile or your applications has changed.",
        ...(n.note ? [`Note from the reviewer: ${n.note}`] : []),
        "You are welcome to sit the assessment again. If you think this is a mistake, reply to this email and tell us what happened."
      ],
      inAppTitle: "Your competency band has been withdrawn",
      inAppBody: `After a live check on your ${field} assessment, the band has been removed from your profile. You can sit the assessment again.`
    };
  }

  if (n.event === "verified") {
    return {
      subject: `Your competency band for ${field} is verified`,
      kicker: "Assessment verified",
      heading: "Your band has been verified by a person.",
      preheader: "Your profile now shows a human verified band.",
      paragraphs: [
        `Hello ${first}, thank you for taking the time to talk through your assessment answers with us.`,
        `Your band of ${band}${scored} stands, and your profile now shows that it was verified by a person rather than scored automatically. Employers searching MYJOBHACK can see that.`,
        ...(n.note ? [`Note from the reviewer: ${n.note}`] : []),
        "There is nothing more you need to do."
      ],
      inAppTitle: "Your competency band is verified ✓",
      inAppBody: `Your ${band} band in ${field} has been verified by a person and your profile now says so.`
    };
  }

  if (n.event === "overridden") {
    return {
      subject: `Your competency band for ${field} is live`,
      kicker: "Assessment reviewed",
      heading: "Your competency band is live.",
      preheader: `Your band in ${field} has been published to your profile.`,
      paragraphs: [
        `Hello ${first}, a reviewer has finished reading your assessment in ${field} and adjusted the automatic score.`,
        `Your band is now ${band}${scored}. That is what your profile shows, and what employers searching MYJOBHACK see.`,
        ...(n.note ? [`Note from the reviewer: ${n.note}`] : []),
        "If you want a different result, you are welcome to sit the assessment again."
      ],
      inAppTitle: "Your competency badge is live",
      inAppBody: `A reviewer adjusted your score and published it. Your band in ${field} is ${band}${scored}.`
    };
  }

  return {
    subject: `Your competency band for ${field} is live`,
    kicker: "Assessment reviewed",
    heading: "Your competency band is live.",
    preheader: `Your band in ${field} has been published to your profile.`,
    paragraphs: [
      `Hello ${first}, a reviewer has finished checking your assessment in ${field}.`,
      `Your band is ${band}${scored}. It is now on your profile, and employers searching MYJOBHACK can see it.`,
      ...(n.note ? [`Note from the reviewer: ${n.note}`] : []),
      "Thank you for waiting while it was reviewed."
    ],
    inAppTitle: "Your competency badge is live 🎉",
    inAppBody: `Your band in ${field} is ${band}${scored}, and employers can now see it.`
  };
}

/**
 * Never throws. A band that has already been published must not be reported
 * as a failed review because a mail provider was down, and a reviewer should
 * still be told honestly whether the candidate heard about it.
 */
export async function notifyBandDecision(
  n: BandNotice
): Promise<{ notified: boolean; emailed: boolean; error: string | null }> {
  let profile: { email: string | null; full_name: string | null } | null = null;
  try {
    const { data } = await n.admin.from("profiles")
      .select("email, full_name").eq("id", n.talentId).maybeSingle();
    profile = (data as any) ?? null;
  } catch { /* fall through: the notification below still has a profile id */ }

  const first = firstNameOf(profile?.full_name);
  const copy = copyFor(n, first);

  let notified = false;
  try {
    const { error } = await n.admin.from("notifications").insert({
      profile_id: n.talentId, title: copy.inAppTitle, body: copy.inAppBody, link: BADGE_LINK
    });
    notified = !error;
  } catch { /* the email below is the channel that actually reaches them */ }

  if (!profile?.email) {
    return { notified, emailed: false, error: "no email address on this profile" };
  }

  try {
    const [r] = await routeMail([{
      to: profile.email,
      subject: copy.subject,
      html: renderEmail({
        preheader: copy.preheader,
        kicker: copy.kicker,
        heading: copy.heading,
        paragraphs: copy.paragraphs,
        cta: n.event === "withdrawn"
          ? { label: "Sit the assessment again", url: `${APP()}${BADGE_LINK}` }
          : { label: "See my badge", url: `${APP()}${BADGE_LINK}` }
      })
    }], { bulk: false });

    await logSends(n.admin, [{
      recipient: profile.email, subject: copy.subject, kind: "transactional",
      profile_id: n.talentId, sent_by: n.reviewerId ?? null,
      status: r?.error ? "failed" : "sent",
      error: r?.error ?? null,
      provider: (r as any)?.provider ?? "resend",
      preview: copy.inAppBody
    }]).catch(() => {});

    return { notified, emailed: !r?.error, error: r?.error ?? null };
  } catch (err: any) {
    return { notified, emailed: false, error: err?.message ?? "send failed" };
  }
}
