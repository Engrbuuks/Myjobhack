import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { plan_id } = await request.json();
  const admin = createAdminClient();
  const { data: plan } = await admin.from("employer_plans").select("*").eq("id", plan_id).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  // Free plan: activate immediately. Paid: create active row pending payment confirmation
  // (kept simple; wire to Paystack/manual confirm like your seeker subscriptions).
  const period_end = new Date(); period_end.setMonth(period_end.getMonth() + 1);

  // upsert single active sub per employer
  const { data: existing } = await admin.from("employer_subscriptions").select("id").eq("profile_id", user.id).maybeSingle();
  if (existing) {
    await admin.from("employer_subscriptions").update({
      plan_id, status: "active", period_start: new Date().toISOString().slice(0, 10),
      period_end: period_end.toISOString().slice(0, 10), views_used: 0
    }).eq("id", existing.id);
  } else {
    await admin.from("employer_subscriptions").insert({
      profile_id: user.id, plan_id, status: "active",
      period_end: period_end.toISOString().slice(0, 10)
    });
  }

  return NextResponse.json({
    ok: true,
    message: Number(plan.price_ngn) === 0
      ? "Free plan activated."
      : `${plan.name} selected. Transfer ₦${Number(plan.price_ngn).toLocaleString()} to activate — details on the Payments page.`
  });
}
