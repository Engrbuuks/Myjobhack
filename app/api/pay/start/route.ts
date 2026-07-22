import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initPaystack, PayPurpose } from "@/lib/paystack";
import { getPricing } from "@/lib/pricing";

export const runtime = "nodejs";

/**
 * Single entry point to start any payment. Computes the correct amount
 * server-side (never trust the client for price), records a pending payment,
 * and returns the Paystack checkout URL.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("email, role").eq("id", user.id).single();
  if (!me?.email) return NextResponse.json({ error: "No email on file." }, { status: 400 });

  const { purpose, ref } = await request.json() as { purpose: PayPurpose; ref: Record<string, any> };
  const pricing = await getPricing();
  let amount = 0;
  const metadata: Record<string, any> = { profile_id: user.id };

  // Server-side amount + metadata per purpose.
  if (purpose === "profile_unlock") {
    const { data: elite } = await admin.from("elite_memberships").select("id").eq("talent_id", ref.talent_id).eq("status", "verified").maybeSingle();
    amount = elite ? pricing.elite_unlock_premium_ngn : 1500; // elite premium unlock vs base unlock fee
    metadata.employer_id = user.id; metadata.talent_id = ref.talent_id;
  } else if (purpose === "placement_fee") {
    const { data: pl } = await admin.from("placements").select("fee_amount, invoice_id").eq("id", ref.placement_id).maybeSingle();
    amount = Number(pl?.fee_amount) || 0;
    metadata.placement_id = ref.placement_id; metadata.invoice_id = pl?.invoice_id;
  } else if (purpose === "job_assessment") {
    const { data: order } = await admin.from("assessment_orders").select("amount, invoice_id").eq("id", ref.order_id).maybeSingle();
    amount = Number(order?.amount) || 0;
    metadata.order_id = ref.order_id; metadata.invoice_id = order?.invoice_id;
  } else if (purpose === "elite_premium") {
    amount = pricing.elite_premium_ngn;
    metadata.talent_id = user.id;
  } else if (purpose === "employer_subscription" || purpose === "seeker_subscription") {
    const table = purpose === "employer_subscription" ? "employer_plans" : "plans";
    const { data: plan } = await admin.from(table).select("price_ngn").eq("id", ref.plan_id).maybeSingle();
    amount = Number(plan?.price_ngn) || 0;
    metadata.plan_id = ref.plan_id;
  } else {
    return NextResponse.json({ error: "Unsupported purpose." }, { status: 400 });
  }

  if (amount <= 0) return NextResponse.json({ error: "Nothing to pay." }, { status: 400 });

  // Record a pending payment row for reconciliation.
  const { data: pay } = await admin.from("payments").insert({
    profile_id: user.id, amount, currency: "NGN", method: "paystack", status: "initiated",
    meta: { purpose, ...metadata }
  }).select("id").single();
  metadata.payment_id = pay?.id;

  const init = await initPaystack({ email: me.email, amount_ngn: amount, purpose, metadata });
  if (!init.ok) return NextResponse.json({ error: init.error }, { status: 502 });

  // stash reference on the payment
  if (pay?.id && init.reference) await admin.from("payments").update({ provider_ref: init.reference }).eq("id", pay.id);

  return NextResponse.json({ ok: true, url: init.authorization_url });
}
