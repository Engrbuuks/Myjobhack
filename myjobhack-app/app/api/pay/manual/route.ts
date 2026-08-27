import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { markPendingSubscription } from "@/lib/subscription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { currency, proof_document_id, reference, plan_id } = await request.json();
  if (!["NGN", "USD"].includes(currency))
    return NextResponse.json({ error: "Currency must be NGN or USD" }, { status: 400 });

  const admin = createAdminClient();
  const planQ = admin.from("plans").select("*").eq("active", true);
  const { data: plan } = plan_id
    ? await planQ.eq("id", plan_id).single()
    : await planQ.order("sort", { ascending: false }).limit(1).single();
  if (!plan) return NextResponse.json({ error: "No active plan" }, { status: 400 });

  const method = currency === "USD" ? "manual_transfer_usd" : "manual_transfer_ngn";
  const amount = currency === "USD" ? plan.price_usd : plan.price_ngn;
  const subId = await markPendingSubscription(user.id, plan.id, method);

  const { error } = await admin.from("payments").insert({
    profile_id: user.id, subscription_id: subId, amount, currency,
    method: method as any, status: "pending_review",
    proof_document_id: proof_document_id ?? null, provider_ref: reference ?? null, plan_id: plan.id,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("activity_log").insert({
    actor_id: user.id, action: `Manual ${currency} payment submitted`,
    entity: "payment", meta: { amount, currency }
  });
  return NextResponse.json({ ok: true });
}
