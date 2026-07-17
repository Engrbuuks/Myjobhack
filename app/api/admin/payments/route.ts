import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription";
import { enrollAfterPayment } from "@/lib/trainingPay";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { payment_id, action } = await request.json();
  if (!payment_id || !["confirm", "reject"].includes(action))
    return NextResponse.json({ error: "payment_id and action required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("*").eq("id", payment_id).single();
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "pending_review")
    return NextResponse.json({ error: "Payment is not pending review" }, { status: 400 });

  if (action === "reject") {
    await admin.from("payments").update({
      status: "failed", confirmed_by: user.id, confirmed_at: new Date().toISOString()
    }).eq("id", payment_id);
    await admin.from("notifications").insert({
      profile_id: payment.profile_id, title: "Payment could not be confirmed",
      body: "We couldn't verify your transfer. Reply to support or try again.",
      link: "/portal/seeker/subscription"
    });
    const { data: rejProf } = await admin.from("profiles").select("email, full_name").eq("id", payment.profile_id).single();
    if (rejProf?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
      await sendEmail(rejProf.email, "About your MYJOBHACK payment", renderEmail({
        kicker: "Payment review",
        heading: "We couldn't confirm your transfer",
        paragraphs: [
          `Hi ${(rejProf.full_name || "there").split(" ")[0]} — we reviewed your ${payment.currency} transfer but couldn't match it to a payment received.`,
          "This is usually a reference mismatch or a transfer still in transit. Reply to this email with your receipt, or submit again from your portal."
        ],
        cta: { label: "Review subscription", url: `${appUrl}/portal/seeker/subscription` }
      }));
    }
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  const { data: plan } = await admin.from("plans").select("id").eq("active", true).limit(1).single();
  if ((payment as any).kind === "training") {
    const r = await enrollAfterPayment(admin, payment_id, user.id);
    if ((r as any).error) return NextResponse.json({ error: (r as any).error }, { status: 400 });
    return NextResponse.json({ ok: true, action: "confirmed" });
  }
  const subId = await activateSubscription(payment.profile_id, plan!.id, payment.method, 30);
  await admin.from("payments").update({
    status: "confirmed", subscription_id: subId,
    confirmed_by: user.id, confirmed_at: new Date().toISOString()
  }).eq("id", payment_id);
  await admin.from("notifications").insert({
    profile_id: payment.profile_id, title: "AI toolkit unlocked 🎉",
    body: "Your transfer is confirmed — all AI tools are now available.",
    link: "/portal/seeker/ai-tools"
  });
  await admin.from("activity_log").insert({
    actor_id: user.id, action: "Confirmed manual payment", entity: "payment", entity_id: payment_id,
    meta: { amount: payment.amount, currency: payment.currency }
  });
  const { data: okProf } = await admin.from("profiles").select("email, full_name").eq("id", payment.profile_id).single();
  if (okProf?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
    const sym = payment.currency === "NGN" ? "₦" : "$";
    await sendEmail(okProf.email, "Your AI toolkit is unlocked 🎉", renderEmail({
      preheader: "Payment confirmed — all AI tools are now active on your account.",
      kicker: "Payment confirmed",
      heading: "The toolkit is yours.",
      paragraphs: [
        `Hi ${(okProf.full_name || "there").split(" ")[0]} — your transfer is confirmed and your subscription is active for the next 30 days.`,
        "AI Resume Review, the Interview Preparer, Skills Gap Analysis — and every tool we add next — are all unlocked."
      ],
      details: [
        ["Amount", `${sym}${Number(payment.amount).toLocaleString()}`],
        ["Method", payment.method.replace(/_/g, " ")],
        ["Active until", new Date(Date.now() + 30 * 864e5).toLocaleDateString("en-GB", { dateStyle: "long" })]
      ],
      cta: { label: "Open AI tools", url: `${appUrl}/portal/seeker/ai-tools` }
    }));
  }
  return NextResponse.json({ ok: true, action: "confirmed" });
}
