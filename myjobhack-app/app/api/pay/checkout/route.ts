import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initPaystack, type PayPurpose } from "@/lib/paystack";
import { getPricing } from "@/lib/pricing";
import { validateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

/**
 * Universal Paystack checkout. Any "Pay now" button in the app calls this with
 * a purpose (+ context). It prices the purpose from the Pricing Center, records
 * a pending payment, and returns a Paystack authorization URL to redirect to.
 * Settlement happens in the webhook via lib/settlePayment.ts.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, email").eq("id", user.id).single();
  const email = me?.email ?? user.email ?? "";
  const pricing = await getPricing();

  const body = await request.json();
  const purpose = body.purpose as PayPurpose;

  let amount = 0;
  const metadata: Record<string, any> = { profile_id: user.id, purpose };

  switch (purpose) {
    case "seeker_subscription":
    case "employer_subscription": {
      const table = purpose === "seeker_subscription" ? "plans" : "employer_plans";
      const { data: plan } = await admin.from(table).select("id, price_ngn, name").eq("id", body.plan_id).eq("active", true).maybeSingle();
      if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 400 });
      amount = Number(plan.price_ngn);
      metadata.plan_id = plan.id; metadata.plan_name = plan.name;
      break;
    }
    case "training": {
      const { data: t } = await admin.from("trainings").select("id, price_ngn, title").eq("id", body.training_id).maybeSingle();
      if (!t) return NextResponse.json({ error: "Training not found." }, { status: 400 });
      amount = Number(t.price_ngn); metadata.training_id = t.id; metadata.title = t.title;

      // Coupon, if one was supplied. Validated server-side — never trust a
      // discounted price sent by the client.
      if (body.coupon_code) {
        const c = await validateCoupon({
          code: String(body.coupon_code), training_id: t.id,
          profile_id: user.id, amount
        });
        if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });

        metadata.coupon_id = c.coupon_id;
        metadata.coupon_code = c.code;
        metadata.original_amount = c.original;
        metadata.discount_amount = c.discount;
        amount = c.final;

        // A coupon that covers the whole price enrols immediately — there is
        // nothing to charge, so no need to send them to Paystack.
        if (amount <= 0) {
          const { recordRedemption } = await import("@/lib/coupons");
          await recordRedemption({
            coupon_id: c.coupon_id, profile_id: user.id, training_id: t.id,
            original: c.original, discount: c.discount, final: 0
          });
          await admin.from("enrollments").upsert(
            { training_id: t.id, talent_id: user.id, status: "registered" },
            { onConflict: "training_id,talent_id" });
          return NextResponse.json({
            ok: true, free: true, amount: 0,
            message: `Coupon ${c.code} covers the full price — you're enrolled.`
          });
        }
      }
      break;
    }
    case "elite_premium":
      amount = pricing.elite_premium_ngn; break;
    case "profile_unlock": {
      // Elite profiles cost the unlock premium; general use base assessment price as unlock fee proxy.
      const { data: elite } = await admin.from("elite_memberships").select("id").eq("talent_id", body.talent_id).eq("status", "verified").maybeSingle();
      amount = elite ? pricing.elite_unlock_premium_ngn : Math.round(pricing.elite_unlock_premium_ngn / 3);
      metadata.talent_id = body.talent_id; metadata.employer_id = user.id;
      break;
    }
    case "assessment_order":
      amount = (Number(body.count) || 1) * pricing.assessment_per_candidate_ngn;
      metadata.job_id = body.job_id ?? null; metadata.talent_ids = body.talent_ids ?? []; metadata.order_id = body.order_id ?? null; metadata.invoice_id = body.invoice_id ?? null;
      break;
    case "job_assessment":
      amount = (Number(body.count) || 1) * pricing.job_assessment_per_candidate_ngn;
      metadata.job_id = body.job_id ?? null; metadata.talent_ids = body.talent_ids ?? []; metadata.order_id = body.order_id ?? null; metadata.invoice_id = body.invoice_id ?? null;
      break;
    case "placement_fee": {
      const { data: p } = await admin.from("placements").select("id, fee_amount").eq("id", body.placement_id).maybeSingle();
      if (!p) return NextResponse.json({ error: "Placement not found." }, { status: 400 });
      amount = Number(p.fee_amount); metadata.placement_id = p.id; metadata.invoice_id = body.invoice_id ?? null;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown payment purpose." }, { status: 400 });
  }

  if (!amount || amount <= 0) return NextResponse.json({ error: "Nothing to charge for this item." }, { status: 400 });

  // Record a pending payment so we can reconcile.
  const { data: payment } = await admin.from("payments").insert({
    profile_id: user.id, amount, currency: "NGN", method: "paystack", status: "initiated",
    purpose, meta: metadata
  }).select("id").single();
  metadata.payment_id = payment?.id;

  const pay = await initPaystack({ email, amount_ngn: amount, purpose, metadata });
  if (!pay.ok) return NextResponse.json({ error: pay.error ?? "Could not start payment." }, { status: 502 });

  await admin.from("payments").update({ provider_ref: pay.reference }).eq("id", payment!.id);
  return NextResponse.json({ ok: true, authorization_url: pay.authorization_url, reference: pay.reference, amount });
}
