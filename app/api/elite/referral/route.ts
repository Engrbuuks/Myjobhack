import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, tooMany, LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * A member invites someone they believe belongs in the room.
 *
 * GET  lists the caller's own invitations and what they have earned.
 * POST { email } records one and returns the link to send.
 *
 * NO MONEY ANYWHERE IN HERE, and that is deliberate rather than unfinished.
 * A cash bounty was considered and not agreed, so there is no payout field,
 * no balance and no amount. What a referrer earns is standing: a count on
 * their record that the room can see. Nothing in this file promises anything
 * else, because a half built payout is worse than none.
 *
 * THIS ROUTE DOES NOT SEND EMAIL. The member sends the link themselves, which
 * is both more likely to be read and keeps the invitation out of the daily
 * sending allowance that application receipts depend on.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: mine }, { data: me }] = await Promise.all([
    admin.from("elite_referrals")
      .select("invited_email, code, accepted_at, created_at")
      .eq("referrer_id", user.id).order("created_at", { ascending: false }).limit(50),
    admin.from("elite_memberships").select("referral_credits, status").eq("talent_id", user.id).maybeSingle()
  ]);

  return NextResponse.json({
    credits: me?.referral_credits ?? 0,
    invitations: (mine ?? []).map((r: any) => ({
      email: r.invited_email,
      link: `${APP()}/join?ref=${r.code}`,
      accepted: !!r.accepted_at,
      sent: r.created_at
    }))
  });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await rateLimit(user.id, LIMITS.referral_user);
  if (!limit.ok)
    return tooMany(
      "That is a lot of invitations for one day. The room grows by recommendation, not by mail merge.",
      limit.retryAfterSeconds
    );

  const body = await request.json().catch(() => ({} as any));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email))
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("elite_memberships")
    .select("id, status").eq("talent_id", user.id).maybeSingle();
  if (me?.status !== "verified")
    return NextResponse.json({
      error: "Invitations open once your own membership is verified."
    }, { status: 403 });

  /**
   * Two checks that stop this becoming a way to inflate a count.
   *
   * Inviting yourself is the obvious one. Inviting somebody who is already on
   * the platform is the subtler one: without it, a member could invite the
   * entire existing membership and collect credit for people they never
   * brought in.
   */
  const { data: myProfile } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
  if ((myProfile?.email ?? "").toLowerCase() === email)
    return NextResponse.json({ error: "That is your own address." }, { status: 400 });

  /**
   * Is that address already registered? Recorded, never reported.
   *
   * Answering "someone is already registered with that address" turned this
   * into a free lookup service: ten probes a day telling an attacker whether
   * a named person has an account here. The response below is now identical
   * either way, and the flag is what keeps an ineligible invitation from ever
   * earning standing.
   *
   * The pattern is escaped before it reaches ilike. Without that, an address
   * like %@acme.com passes the validator and runs a wildcard search across
   * every profile email, and maybeSingle then distinguishes "exactly one
   * account matches this pattern" from "none". The registration route had to
   * fix this same wildcard hole; it is fixed here rather than repeated.
   */
  const pattern = email.replace(/[\\%_]/g, (ch) => "\\" + ch);
  const { data: existing } = await admin.from("profiles")
    .select("id").ilike("email", pattern).limit(1).maybeSingle();

  const code = `R${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  const { error } = await admin.from("elite_referrals").insert({
    referrer_id: user.id, invited_email: email, code,
    invitee_existed: !!existing
  });

  // The unique index on (referrer, email) is what makes a second invitation
  // to the same person a no op rather than a second credit.
  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      const { data: prior } = await admin.from("elite_referrals")
        .select("code").eq("referrer_id", user.id).eq("invited_email", email).maybeSingle();
      return NextResponse.json({
        ok: true, already: true,
        link: prior ? `${APP()}/join?ref=${prior.code}` : null,
        message: "You have already invited that address. The original link still works."
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    link: `${APP()}/join?ref=${code}`,
    message: "Send them this link. Standing is credited when the person at that address is verified into Elite, not when they sign up, and it is matched on the address rather than on the link."
  });
}
