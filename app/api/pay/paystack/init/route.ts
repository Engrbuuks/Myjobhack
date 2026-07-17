import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Paystack is not configured yet — use bank transfer for now." }, { status: 400 });

  const admin = createAdminClient();
  const { data: plan } = await admin.from("plans").select("*").eq("active", true).limit(1).single();
  if (!plan) return NextResponse.json({ error: "No active plan" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const { data: payment } = await admin.from("payments").insert({
    profile_id: user.id, amount: plan.price_ngn, currency: "NGN",
    method: "paystack", status: "initiated"
  }).select("id").single();

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: Math.round(Number(plan.price_ngn) * 100), // kobo
      callback_url: `${appUrl}/api/pay/paystack/verify`,
      metadata: { profile_id: user.id, plan_id: plan.id, payment_id: payment!.id }
    })
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.authorization_url) {
    return NextResponse.json({ error: json?.message ?? "Paystack initialization failed" }, { status: 500 });
  }
  await admin.from("payments").update({ provider_ref: json.data.reference }).eq("id", payment!.id);
  return NextResponse.json({ url: json.data.authorization_url });
}
