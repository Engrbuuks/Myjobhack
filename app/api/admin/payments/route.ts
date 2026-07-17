import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription";

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
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  const { data: plan } = await admin.from("plans").select("id").eq("active", true).limit(1).single();
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
  return NextResponse.json({ ok: true, action: "confirmed" });
}
