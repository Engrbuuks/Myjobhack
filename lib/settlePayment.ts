import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription";
import { enrollAfterPayment } from "@/lib/trainingPay";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

/**
 * Settles a successful Paystack charge based on its `purpose`.
 * Idempotent: safe to call from both the webhook and the verify return page.
 */
export async function settlePayment(data: any): Promise<{ settled: boolean; note?: string }> {
  const admin = createAdminClient();
  const m = data?.metadata ?? {};
  const purpose = m.purpose;
  const reference = data?.reference;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

  // Global idempotency guard on reference.
  if (reference) {
    const { data: seen } = await admin.from("payments").select("id, status").eq("provider_ref", reference).maybeSingle();
    if (seen?.status === "confirmed") return { settled: true, note: "already settled" };
  }

  switch (purpose) {
    case "training": {
      if (m.payment_id) await enrollAfterPayment(admin, m.payment_id, m.profile_id ?? "system");
      return { settled: true };
    }

    case "seeker_subscription":
    case "employer_subscription": {
      if (!m.profile_id || !m.plan_id) return { settled: false, note: "missing sub metadata" };
      const subId = await activateSubscription(m.profile_id, m.plan_id, "paystack", 30);
      if (m.payment_id) await admin.from("payments").update({
        status: "confirmed", subscription_id: subId, confirmed_at: new Date().toISOString(), provider_ref: reference
      }).eq("id", m.payment_id);
      await notify(admin, m.profile_id, "Subscription active 🎉", "Your plan is active.", "/portal");
      return { settled: true };
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
