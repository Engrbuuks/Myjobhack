import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollAfterPayment } from "@/lib/trainingPay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("payment_id");
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const back = `${appUrl}/portal/seeker/trainings`;
  if (!paymentId || !reference) return NextResponse.redirect(back);

  const key = process.env.PAYSTACK_SECRET_KEY;
  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const json = await res.json();
  if (json?.data?.status === "success") {
    const admin = createAdminClient();
    await enrollAfterPayment(admin, paymentId, json.data.metadata?.profile_id ?? "system");
  }
  return NextResponse.redirect(back);
}
