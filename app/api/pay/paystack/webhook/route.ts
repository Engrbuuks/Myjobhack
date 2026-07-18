import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription";
import { enrollAfterPayment } from "@/lib/trainingPay";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto.createHmac("sha512", key).update(raw).digest("hex");
  if (signature !== expected)
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const event = JSON.parse(raw);
  if (event?.event !== "charge.success") return NextResponse.json({ received: true });

  const d = event.data;
  const profileId = d?.metadata?.profile_id;
  const planId = d?.metadata?.plan_id;
  const paymentId = d?.metadata?.payment_id;
  const reference = d?.reference;
  if (!profileId || !planId) return NextResponse.json({ received: true });

  const admin = createAdminClient();

  // training payments take their own path
  if (d?.metadata?.kind === "training" && paymentId) {
    await enrollAfterPayment(admin, paymentId, profileId ?? "system");
    return NextResponse.json({ received: true });
  }

  // idempotency: skip if this payment is already confirmed
  if (paymentId) {
    const { data: pay } = await admin.from("payments").select("status").eq("id", paymentId).single();
    if (pay?.status === "confirmed") return NextResponse.json({ received: true });
  }

  const subId = await activateSubscription(profileId, planId, "paystack", 30);
  if (paymentId) {
    await admin.from("payments").update({
      status: "confirmed", subscription_id: subId,
      confirmed_at: new Date().toISOString(), provider_ref: reference
    }).eq("id", paymentId);
  }
  await admin.from("notifications").insert({
    profile_id: profileId, title: "Career Toolkit unlocked 🎉",
    body: "Your subscription is active — all toolkit are now available.",
    link: "/portal/seeker/ai-tools"
  });
  await admin.from("activity_log").insert({
    actor_id: profileId, action: "Subscription activated (webhook)",
    entity: "subscription", entity_id: subId, meta: { reference }
  });
  const { data: prof } = await admin.from("profiles").select("email, full_name").eq("id", profileId).single();
  if (prof?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
    await sendEmail(prof.email, "Your Career Toolkit is unlocked 🎉", renderEmail({
      preheader: "Payment received — all toolkit are now active on your account.",
      kicker: "Payment confirmed",
      heading: "The toolkit is yours.",
      paragraphs: [
        `Hi ${(prof.full_name || "there").split(" ")[0]} — your Paystack payment went through and your subscription is active for the next 30 days.`,
        "AI Resume Review, the Interview Preparer, Skills Gap Analysis — and every tool we add next — are all unlocked."
      ],
      details: [["Reference", String(reference ?? "")]],
      cta: { label: "Open toolkit", url: `${appUrl}/portal/seeker/ai-tools` }
    }));
  }
  return NextResponse.json({ received: true });
}
