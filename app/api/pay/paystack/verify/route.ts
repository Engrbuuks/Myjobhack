import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settlePayment } from "@/lib/settlePayment";

export const runtime = "nodejs";

/**
 * Paystack return URL for a seeker subscription.
 *
 * Settlement goes through lib/settlePayment.ts rather than calling
 * activateSubscription here, so this unauthenticated GET shares the reference
 * guard the webhook already relies on. It used to activate on every request:
 * since activateSubscription extends from the existing period end, reloading
 * the callback bought another 30 days each time.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const fail = (msg: string) =>
    NextResponse.redirect(`${appUrl}/portal/seeker/subscription?status=failed&msg=${encodeURIComponent(msg)}`);

  if (!reference) return fail("Missing reference");
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return fail("Paystack not configured");

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const json = await res.json();
  const d = json?.data;
  if (!res.ok || d?.status !== "success") return fail(json?.message ?? "Payment not successful");

  const profileId = d?.metadata?.profile_id;
  const planId = d?.metadata?.plan_id;
  if (!profileId || !planId) return fail("Missing metadata");

  // /api/pay/paystack/init stamps no purpose on its metadata, and this route is
  // only ever the callback for a seeker plan, so the purpose is set here rather
  // than read from the charge: the dispatcher would otherwise fall through to
  // "unknown purpose", and a charge carrying some other purpose must not be
  // settled as something else through this door.
  const result = await settlePayment({ ...d, metadata: { ...(d.metadata ?? {}), purpose: "seeker_subscription" } });
  if (!result.settled) return fail(result.note ?? "Could not confirm this payment");

  // A replay gets the success page and nothing else: no extra days, and no
  // second entry in the log.
  if (!result.already && result.subscription_id) {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      actor_id: profileId, action: "Subscription activated via Paystack",
      entity: "subscription", entity_id: result.subscription_id, meta: { reference }
    });
  }
  return NextResponse.redirect(`${appUrl}/portal/seeker/subscription?status=success`);
}
