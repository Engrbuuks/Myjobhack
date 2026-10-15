import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription";
import { checkTrainingCharge, enrollAfterPayment } from "@/lib/trainingPay";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

/**
 * Settles a successful Paystack charge based on its `purpose`.
 * Idempotent: safe to call from both the webhook and the verify return page.
 */
export async function settlePayment(data: any): Promise<{
  settled: boolean; note?: string; already?: boolean; subscription_id?: string;
}> {
  const admin = createAdminClient();
  const m = data?.metadata ?? {};
  const purpose = m.purpose;
  const reference = data?.reference;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

  // Global idempotency guard on reference. Read several rather than one:
  // maybeSingle() raises when a reference somehow sits on two rows, which left
  // this guard open in exactly the case it exists for.
  if (reference) {
    const { data: seen } = await admin.from("payments").select("id, status").eq("provider_ref", reference).limit(5);
    if ((seen ?? []).some((p: any) => p.status === "confirmed"))
      return { settled: true, already: true, note: "already settled" };
  }

  switch (purpose) {
    case "training": {
      if (m.payment_id) {
        // The charge still has to match the row it claims to pay. The metadata
        // on a charge is only as trustworthy as whoever initialised it, and a
        // charge can be initialised with our public key.
        const check = await checkTrainingCharge(admin, String(m.payment_id), data);
        if (!check.ok) {
          if (check.already) return { settled: true, already: true, note: "already settled" };
          return { settled: false, note: check.error };
        }
        await enrollAfterPayment(admin, check.pay.id, check.pay.profile_id ?? m.profile_id ?? "system");
      }

      // If a coupon was used, record the redemption now that money has actually
      // moved — this is what enforces usage limits and reports what each code earned.
      if (m.coupon_id && m.profile_id) {
        const { recordRedemption } = await import("@/lib/coupons");
        await recordRedemption({
          coupon_id: String(m.coupon_id),
          profile_id: String(m.profile_id),
          training_id: m.training_id ? String(m.training_id) : null,
          original: Number(m.original_amount) || 0,
          discount: Number(m.discount_amount) || 0,
          final: Number(m.original_amount || 0) - Number(m.discount_amount || 0),
          payment_id: m.payment_id ? String(m.payment_id) : null
        });
      }
      return { settled: true };
    }

    case "seeker_subscription":
    case "employer_subscription": {
      if (!m.profile_id || !m.plan_id) return { settled: false, note: "missing sub metadata" };
      const subId = await activateSubscription(m.profile_id, m.plan_id, "paystack", 30);
      if (m.payment_id) {
        await admin.from("payments").update({
          status: "confirmed", subscription_id: subId, confirmed_at: new Date().toISOString(), provider_ref: reference
        }).eq("id", m.payment_id);
      } else if (reference) {
        // No pending row to confirm, so write one. The guard at the top of this
        // function recognises a replay by finding a confirmed row for the
        // reference, and activateSubscription extends from the existing period
        // end: a reference that settles without leaving a trace buys 30 days
        // every time it is presented.
        await admin.from("payments").insert({
          profile_id: m.profile_id, amount: Number(data?.amount ?? 0) / 100,
          currency: data?.currency ?? "NGN", method: "paystack", status: "confirmed",
          purpose, provider_ref: reference, subscription_id: subId,
          confirmed_at: new Date().toISOString(), meta: m
        });
      }
      // Seekers buy this to reach the toolkit, so say so and land them there.
      if (purpose === "seeker_subscription") {
        await notify(admin, m.profile_id, "Career Toolkit unlocked 🎉",
          "Your subscription is active — all toolkit are now available.", "/portal/seeker/ai-tools");
      } else {
        await notify(admin, m.profile_id, "Subscription active 🎉", "Your plan is active.", "/portal");
      }
      return { settled: true, subscription_id: subId };
    }

    case "profile_unlock": {
      // Grant the unlock (Elite costs more views, handled at init/price time).
      if (m.employer_id && m.talent_id) {
        await admin.from("profile_unlocks").upsert(
          { employer_id: m.employer_id, talent_id: m.talent_id, paid_ref: reference },
          { onConflict: "employer_id,talent_id" }
        );
      }
      await markPaid(admin, m.payment_id, reference);
      return { settled: true };
    }

    case "placement_fee": {
      if (m.placement_id) await admin.from("placements").update({ status: "paid" }).eq("id", m.placement_id);
      if (m.invoice_id) await admin.from("invoices").update({ status: "paid" }).eq("id", m.invoice_id);
      await markPaid(admin, m.payment_id, reference);
      return { settled: true };
    }

    case "assessment_order":
    case "job_assessment": {
      if (m.order_id) await admin.from("assessment_orders").update({ status: "paid" }).eq("id", m.order_id);
      if (m.invoice_id) await admin.from("invoices").update({ status: "paid" }).eq("id", m.invoice_id);
      await markPaid(admin, m.payment_id, reference);
      return { settled: true };
    }

    case "elite_premium": {
      if (m.talent_id) {
        await admin.from("elite_memberships").update({ premium_active: true, premium_since: new Date().toISOString() })
          .eq("talent_id", m.talent_id);
      }
      await markPaid(admin, m.payment_id, reference);
      await notify(admin, m.talent_id, "Elite premium active", "Your premium perks are unlocked.", "/portal/elite");
      return { settled: true };
    }

    default:
      return { settled: false, note: `unknown purpose: ${purpose}` };
  }
}

async function markPaid(admin: any, paymentId: string | undefined, ref: string) {
  if (paymentId) await admin.from("payments").update({
    status: "confirmed", confirmed_at: new Date().toISOString(), provider_ref: ref
  }).eq("id", paymentId);
}
async function notify(admin: any, profileId: string | undefined, title: string, body: string, link: string) {
  if (!profileId) return;
  await admin.from("notifications").insert({ profile_id: profileId, title, body, link });
}
