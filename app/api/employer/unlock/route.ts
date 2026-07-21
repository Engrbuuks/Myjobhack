import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/pricing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { talent_id } = await request.json();
  const admin = createAdminClient();

  // already unlocked? free re-view
  const { data: prior } = await admin.from("profile_unlocks")
    .select("id").eq("employer_id", user.id).eq("talent_id", talent_id).maybeSingle();
  if (prior) return NextResponse.json({ ok: true, already: true });

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

  await admin.from("profile_unlocks").insert({ employer_id: user.id, talent_id });
  await admin.from("employer_subscriptions").update({ views_used: sub.views_used + cost }).eq("id", sub.id);

  return NextResponse.json({ ok: true, views_used: sub.views_used + cost, cap, elite: isElite });
}
