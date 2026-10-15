import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { talent_id } = await request.json().catch(() => ({} as any));
  // An absent talent_id used to reach the database as `undefined`, which
  // matches nothing and still spends a view off the plan.
  if (!talent_id || typeof talent_id !== "string")
    return NextResponse.json({ error: "Choose a candidate to unlock." }, { status: 400 });

  const admin = createAdminClient();

  /**
   * This route IS the paywall, so it has to know who is asking.
   *
   * There was no role check here at all: anyone signed in could post a
   * talent_id and have that candidate recorded as unlocked. Two kinds of
   * caller are legitimate and they are authorised differently. Staff unlock
   * from the applicant desk and are not on an employer plan, so they are
   * authorised by capability. An employer pays, so the plan authorises them.
   */
  const { data: me } = await admin.from("profiles")
    .select("id, role, permissions").eq("id", user.id).maybeSingle();
  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");

  if (!isStaff && me?.role !== "employer")
    return NextResponse.json({
      error: "Only employers and MYJOBHACK staff can unlock a candidate's contact details."
    }, { status: 403 });

  if (isStaff && !can(me, "pool.view"))
    return NextResponse.json({
      error: "You do not have permission to browse the talent pool. Ask an administrator for pool access."
    }, { status: 403 });

  // A talent_id that is not a real profile records an unlock against nobody.
  const { data: candidate } = await admin.from("profiles").select("id").eq("id", talent_id).maybeSingle();
  if (!candidate) return NextResponse.json({ error: "That candidate could not be found." }, { status: 404 });

  // already unlocked? free re-view
  const { data: prior } = await admin.from("profile_unlocks")
    .select("id").eq("employer_id", user.id).eq("talent_id", talent_id).maybeSingle();
  if (prior) return NextResponse.json({ ok: true, already: true });

  /**
   * Staff have no employer plan, so there is no cap to spend against. The
   * unlock is still recorded against the caller, because who opened a
   * candidate's contact details is the part worth keeping.
   */
  if (isStaff) {
    const { error: insErr } = await admin.from("profile_unlocks")
      .insert({ employer_id: user.id, talent_id });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, staff: true });
  }

  const { data: sub } = await admin.from("employer_subscriptions")
    .select("id, views_used, plan_id, employer_plans(profile_views_per_month, can_search_pool)")
    .eq("profile_id", user.id).eq("status", "active").maybeSingle();

  if (!sub) return NextResponse.json({ error: "No active plan. Choose a plan to view candidates.", upgrade: true }, { status: 402 });

  // Elite profiles cost more to unlock — they're your premium inventory.
  const { data: elite } = await admin.from("elite_memberships")
    .select("status").eq("talent_id", talent_id).maybeSingle();
  const isElite = !!elite && elite.status === "verified";
  const cost = isElite ? 3 : 1; // Elite unlock spends 3 views, standard spends 1

  const cap = (sub as any).employer_plans?.profile_views_per_month;
  if (cap != null && sub.views_used + cost > cap)
    return NextResponse.json({
      error: isElite
        ? "Unlocking an Elite candidate needs 3 views and you don't have enough left. Upgrade for more."
        : "You've used all your profile views this month. Upgrade for more.",
      upgrade: true
    }, { status: 402 });

  const { error: insErr } = await admin.from("profile_unlocks")
    .insert({ employer_id: user.id, talent_id });
  // The view is only spent when the unlock was actually written, so a failed
  // insert cannot quietly burn someone's allowance.
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  await admin.from("employer_subscriptions").update({ views_used: sub.views_used + cost }).eq("id", sub.id);

  return NextResponse.json({ ok: true, views_used: sub.views_used + cost, cap, elite: isElite });
}
