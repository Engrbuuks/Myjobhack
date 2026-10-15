import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Picks a FREE employer plan. Nothing paid is activated here.
 *
 * This route writes no payment and checks none, so activating a priced plan
 * from it handed the plan out for nothing. Paid plans go through
 * /api/pay/checkout with purpose "employer_subscription", and
 * lib/settlePayment.ts activates them once Paystack confirms the charge.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { plan_id } = await request.json();
  const admin = createAdminClient();

  // Any signed in account could post here, so the role is checked server side.
  // A button only an employer can see is not a permission.
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");
  if (!isStaff && me?.role !== "employer")
    return NextResponse.json({ error: "Only employer accounts can choose a hiring plan." }, { status: 403 });

  const { data: plan } = await admin.from("employer_plans").select("*").eq("id", plan_id).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  if (Number(plan.price_ngn) > 0) {
    return NextResponse.json({
      error: `${plan.name} is a paid plan. Start it from the checkout at /api/pay/checkout with purpose "employer_subscription" and this plan id. It activates as soon as Paystack confirms the charge.`,
      checkout: "/api/pay/checkout", purpose: "employer_subscription", plan_id: plan.id
    }, { status: 402 });
  }

  const period_end = new Date(); period_end.setMonth(period_end.getMonth() + 1);
  const today = new Date().toISOString().slice(0, 10);

  // upsert single active sub per employer
  const { data: existing } = await admin.from("employer_subscriptions")
    .select("id, plan_id, period_end").eq("profile_id", user.id).maybeSingle();

  if (existing) {
    const samePeriod = existing.plan_id === plan.id
      && !!existing.period_end && new Date(existing.period_end) >= new Date(today);

    if (samePeriod) {
      // Re-picking the plan already running changes nothing but the status.
      // Zeroing views_used, or pushing period_end out, would hand back the
      // views already spent, and a quota you can refill on request is no quota.
      await admin.from("employer_subscriptions").update({ status: "active" }).eq("id", existing.id);
    } else {
      await admin.from("employer_subscriptions").update({
        plan_id: plan.id, status: "active", period_start: today,
        period_end: period_end.toISOString().slice(0, 10), views_used: 0
      }).eq("id", existing.id);
    }
  } else {
    await admin.from("employer_subscriptions").insert({
      profile_id: user.id, plan_id: plan.id, status: "active",
      period_end: period_end.toISOString().slice(0, 10)
    });
  }

  return NextResponse.json({ ok: true, message: `${plan.name} activated.` });
}
