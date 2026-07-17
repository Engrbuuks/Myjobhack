import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const fail = (msg: string) =>
    NextResponse.redirect(`${appUrl}/portal/seeker/subscription?status=failed&msg=${encodeURIComponent(msg)}`);

  if (!reference) return fail("Missing reference");
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return fail("Paystack not configured");

  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const json = await res.json();
  const d = json?.data;
  if (!res.ok || d?.status !== "success") return fail(json?.message ?? "Payment not successful");

  const profileId = d?.metadata?.profile_id;
  const planId = d?.metadata?.plan_id;
  const paymentId = d?.metadata?.payment_id;
  if (!profileId || !planId) return fail("Missing metadata");

  const admin = createAdminClient();
  const subId = await activateSubscription(profileId, planId, "paystack", 30);
  if (paymentId) {
    await admin.from("payments").update({
      status: "confirmed", subscription_id: subId,
      confirmed_at: new Date().toISOString(), provider_ref: reference
    }).eq("id", paymentId);
  }
  await admin.from("activity_log").insert({
    actor_id: profileId, action: "Subscription activated via Paystack",
    entity: "subscription", entity_id: subId, meta: { reference }
  });
  await admin.from("notifications").insert({
    profile_id: profileId, title: "AI toolkit unlocked 🎉",
    body: "Your subscription is active — all AI tools are now available.",
    link: "/portal/seeker/ai-tools"
  });
  return NextResponse.redirect(`${appUrl}/portal/seeker/subscription?status=success`);
}
