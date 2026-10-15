import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkTrainingCharge, enrollAfterPayment } from "@/lib/trainingPay";

export const runtime = "nodejs";

/**
 * Paystack return URL for a training seat.
 *
 * The query string says which payment to look at, never what it is worth: the
 * payment row and the charge Paystack reports are the only two things trusted
 * here, and lib/trainingPay.ts checkTrainingCharge has to agree that the one
 * settles the other before anybody is enrolled.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("payment_id");
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const back = `${appUrl}/portal/seeker/trainings`;
  const fail = (msg: string) => NextResponse.redirect(`${back}?status=failed&msg=${encodeURIComponent(msg)}`);

  if (!paymentId || !reference) return NextResponse.redirect(back);

  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return fail("Card payments are not configured.");

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const json = await res.json();
  const d = json?.data;
  if (!res.ok || d?.status !== "success") return fail(json?.message ?? "That payment did not go through.");

  const admin = createAdminClient();
  const check = await checkTrainingCharge(admin, paymentId, d);
  if (!check.ok) {
    // Already confirmed is success as far as the person is concerned: they are
    // enrolled, and reloading this page must not say otherwise.
    if (check.already) return NextResponse.redirect(back);
    return fail(check.error);
  }

  await enrollAfterPayment(admin, check.pay.id, check.pay.profile_id);
  return NextResponse.redirect(back);
}
