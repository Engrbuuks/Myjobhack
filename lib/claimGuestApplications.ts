import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Attach a newly confirmed account to the applications it made as a guest.
 *
 * WHY THIS MOVED, AND WHY IT MATTERS. This ran inside registration, before the
 * email had been confirmed, and matched with `.ilike("guest_email", email)`.
 * Two things followed from that:
 *
 *   · `_` and `%` are legal in an email local part and are wildcards in SQL
 *     LIKE, so registering as "_da@gmail.com" reassigned every guest
 *     application whose address fitted that pattern. A `%` swept the table.
 *   · It did not wait for the address to be confirmed, so anyone could claim
 *     another person's applications by typing their address into the signup
 *     form. Because the update also set talent_id, the real owner could never
 *     claim them afterwards: their CV and application history were bound to
 *     somebody else's profile for good.
 *
 * It now runs after the confirmation link is followed, which proves the person
 * controls the mailbox, and it matches the address exactly.
 */
export async function claimGuestApplications(userId: string, email: string) {
  const address = String(email ?? "").trim().toLowerCase();
  if (!userId || !address) return { claimed: 0 };

  const admin = createAdminClient();

  try {
    const { data: claimed } = await admin.from("applications")
      .update({ talent_id: userId, pool_joined: true })
      // Exact match, not a pattern. The stored address is lowercased on the
      // way in by both apply routes, so this finds the same rows the old
      // case insensitive match was meant to find, and no others.
      .eq("guest_email", address)
      .is("talent_id", null)
      .select("id");

    const n = claimed?.length ?? 0;
    if (n) {
      await admin.from("notifications").insert({
        profile_id: userId,
        title: n === 1 ? "We found your earlier application" : `We found ${n} earlier applications`,
        body: "They are now linked to your profile. Take your competency assessment and employers will see your band against them.",
        link: "/portal/seeker/assessment"
      });
    }
    return { claimed: n };
  } catch {
    // Never block a sign in over this. The applications stay unclaimed and the
    // next confirmation picks them up.
    return { claimed: 0 };
  }
}
