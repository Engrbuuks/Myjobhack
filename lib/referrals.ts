/**
 * Crediting the member who brought somebody in.
 *
 * WHEN IT HAPPENS. On verification, never on signup. Anyone can invite a
 * thousand addresses and some of them will register; only a verified member
 * is evidence that the recommendation was any good, and only verification is
 * a decision a human made.
 *
 * WHAT IS CREDITED. A count, called standing. There is no money in this file
 * and no amount anywhere in the schema, because a cash bounty was proposed
 * and not agreed. If it is ever agreed, the attribution this records is what
 * it would be paid from.
 */
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

export type ReferralCredit = {
  credited: boolean;
  referrerId?: string;
  /** Why nothing was credited, for the activity log rather than the member. */
  reason?: string;
};

/**
 * Called once, as a membership becomes verified.
 *
 * Never throws: a referral that cannot be credited must not stop somebody's
 * membership from being approved. Failures are returned, not raised.
 */
export async function creditReferral(admin: any, newMemberId: string): Promise<ReferralCredit> {
  try {
    const { data: profile } = await admin.from("profiles")
      .select("email, full_name").eq("id", newMemberId).maybeSingle();
    const email = String(profile?.email ?? "").trim().toLowerCase();
    if (!email) return { credited: false, reason: "new member has no email on file" };

    // The oldest unaccepted invitation wins. Two members inviting the same
    // person is a race nobody should have to arbitrate, and the one who
    // recommended them first is the defensible answer.
    const { data: ref } = await admin.from("elite_referrals")
      .select("id, referrer_id, accepted_at, invitee_existed")
      // Exact match on a lowercased address, not a pattern: the address was
      // lowercased when the invitation was written, and ilike on a value that
      // could contain a wildcard is how the wrong row gets matched.
      .eq("invited_email", email)
      .is("accepted_at", null)
      // Ineligible when made, ineligible for ever. Inviting somebody who
      // already had an account is recorded so the route can answer without
      // revealing it, and must never earn standing.
      .eq("invitee_existed", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!ref) return { credited: false, reason: "no open eligible invitation for this address" };

    // Self referral cannot happen through the route, which checks for it, but
    // an address changed after the invitation could produce it. Checked again
    // here because this is where the credit is actually written.
    if (ref.referrer_id === newMemberId)
      return { credited: false, reason: "referrer and new member are the same person" };

    await admin.from("elite_referrals").update({
      accepted_profile_id: newMemberId,
      accepted_at: new Date().toISOString()
    }).eq("id", ref.id);

    // Attribution sits in elite_secrets with the code, so one member cannot
    // read who recommended another by selecting the peer readable row.
    await admin.from("elite_secrets")
      .update({ referred_by: ref.referrer_id })
      .eq("talent_id", newMemberId);

    /**
     * Read then write, rather than a database increment.
     *
     * Two verifications of two people referred by the same member in the same
     * instant could lose one count. The cost of that is a standing figure one
     * too low, which is recoverable from elite_referrals at any time because
     * the attribution rows are the record and this number is a convenience.
     */
    const { data: referrer } = await admin.from("elite_memberships")
      .select("id, referral_credits").eq("talent_id", ref.referrer_id).maybeSingle();
    if (referrer) {
      await admin.from("elite_memberships")
        .update({ referral_credits: (referrer.referral_credits ?? 0) + 1 })
        .eq("id", referrer.id);
    }

    const first = String(profile?.full_name ?? "Someone").split(" ")[0];
    await admin.from("notifications").insert({
      profile_id: ref.referrer_id,
      title: "Your recommendation came through",
      body: `${first}, who you invited, has been verified into Elite. Your standing in the room has gone up.`,
      link: "/portal/elite"
    });

    // A quiet note, not a campaign. One message to one person who did
    // something useful, so it does not go near the bulk allowance.
    const { data: referrerProfile } = await admin.from("profiles")
      .select("email, full_name").eq("id", ref.referrer_id).maybeSingle();
    if (referrerProfile?.email) {
      await sendEmail(referrerProfile.email, "Your recommendation was verified", renderEmail({
        kicker: "Myjobhack Elite",
        heading: "They are in.",
        paragraphs: [
          `${(referrerProfile.full_name || "").split(" ")[0]}, ${first} has been verified into Elite on your recommendation.`,
          "Your standing in the room reflects it. Standing is recognition, not a payment, and it is visible to the members you sit with."
        ],
        cta: { label: "See your standing", url: `${APP()}/portal/elite` }
      })).catch(() => {});
    }

    return { credited: true, referrerId: ref.referrer_id };
  } catch (e: any) {
    return { credited: false, reason: e?.message ?? "referral credit failed" };
  }
}
