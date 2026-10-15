import { NextResponse } from "next/server";
import crypto from "crypto";
import { settlePayment } from "@/lib/settlePayment";

export const runtime = "nodejs";

/**
 * Single Paystack webhook — verifies signature, then dispatches to
 * settlePayment() which handles every purpose (subscriptions, trainings,
 * unlocks, placement fees, assessments, Elite premium).
 */
export async function POST(request: Request) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto.createHmac("sha512", key).update(raw).digest("hex");
  // Length is checked first because timingSafeEqual throws on a mismatch, and
  // the compare itself is constant time so a wrong signature leaks nothing
  // about how much of it was right.
  const sent = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (sent.length !== want.length || !crypto.timingSafeEqual(sent, want))
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const event = JSON.parse(raw);
  if (event?.event !== "charge.success") return NextResponse.json({ received: true });

  try {
    const result = await settlePayment(event.data);
    return NextResponse.json({ received: true, ...result });
  } catch (e: any) {
    // Return 200 so Paystack doesn't hammer retries; log for manual review.
    return NextResponse.json({ received: true, error: e?.message ?? "settle error" });
  }
}
