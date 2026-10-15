import { renderEmail } from "@/lib/email";
import { sendEmail } from "@/lib/resend";

/**
 * Decides whether a successful Paystack charge is allowed to settle a given
 * training payment row.
 *
 * A charge being genuine says nothing about which row it was meant to pay.
 * Both the webhook and the return URL go through this, because the return URL
 * is a plain GET: it used to take the payment id and the reference as two
 * unrelated query parameters, so a cheap reference could confirm an expensive
 * seat.
 */
export async function checkTrainingCharge(
  admin: any, paymentId: string, charge: { reference?: string; amount?: number; currency?: string }
): Promise<{ ok: true; pay: any } | { ok: false; error: string; already?: boolean }> {
  const { data: pay } = await admin.from("payments")
    .select("id, status, profile_id, training_id, amount, currency, provider_ref")
    .eq("id", paymentId).maybeSingle();
  if (!pay?.training_id) return { ok: false, error: "Not a training payment" };
  if (pay.status === "confirmed") return { ok: false, already: true, error: "This payment is already confirmed." };

  const reference = String(charge?.reference ?? "");
  if (!reference) return { ok: false, error: "Payment reference missing." };

  if (pay.provider_ref) {
    if (pay.provider_ref !== reference)
      return { ok: false, error: "That payment reference belongs to a different order." };
  } else {
    // A row with no reference yet (a transfer later paid by card, say) may
    // claim one, but only a reference no other row has already claimed.
    const { data: other } = await admin.from("payments")
      .select("id").eq("provider_ref", reference).neq("id", pay.id).limit(1);
    if ((other ?? []).length)
      return { ok: false, error: "That payment reference belongs to a different order." };
  }

  // Paystack works in the currency's minor unit; payments.amount is the major
  // unit (lib/paystack.ts multiplies by 100 on the way out), so the expected
  // figure is scaled the same way. Currencies must match before the numbers
  // are worth comparing: 25,000 cents is not 25,000 kobo.
  const paidMinor = Math.round(Number(charge?.amount ?? 0));
  const expectedMinor = Math.round(Number(pay.amount) * 100);
  if (String(charge?.currency ?? "NGN") !== String(pay.currency ?? "NGN"))
    return { ok: false, error: "That payment was made in a different currency to this order." };
  if (!paidMinor || paidMinor < expectedMinor)
    return { ok: false, error: "The amount paid is less than the amount due." };

  // Record the reference before enrolling so a second call, or the webhook
  // arriving at the same moment, cannot point it at another row.
  if (!pay.provider_ref) await admin.from("payments").update({ provider_ref: reference }).eq("id", pay.id);

  return { ok: true, pay };
}

/** Confirm a training payment: enroll, notify, email. Idempotent. */
export async function enrollAfterPayment(admin: any, paymentId: string, actorId: string) {
  const { data: pay } = await admin.from("payments")
    .select("id, status, profile_id, training_id, amount, currency").eq("id", paymentId).single();
  if (!pay?.training_id) return { error: "Not a training payment" };
  if (pay.status === "confirmed") return { ok: true, already: true };

  // Claim the row in the same statement that reads it, so of two callers
  // racing here (webhook and return URL) only one enrols, notifies and emails.
  const { data: claimed } = await admin.from("payments").update({
    status: "confirmed", confirmed_at: new Date().toISOString()
  }).eq("id", paymentId).neq("status", "confirmed").select("id");
  if (!(claimed ?? []).length) return { ok: true, already: true };

  const { data: existing } = await admin.from("enrollments")
    .select("id").eq("training_id", pay.training_id).eq("talent_id", pay.profile_id).maybeSingle();
  if (!existing) {
    await admin.from("enrollments").insert({
      training_id: pay.training_id, talent_id: pay.profile_id, status: "registered"
    });
  }

  const { data: training } = await admin.from("trainings").select("title").eq("id", pay.training_id).single();
  await admin.from("notifications").insert({
    profile_id: pay.profile_id, title: "You're in — payment confirmed 🎉",
    body: `Your seat in "${training?.title}" is secured.`,
    link: "/portal/seeker/trainings"
  });
  const { data: prof } = await admin.from("profiles").select("email, full_name").eq("id", pay.profile_id).single();
  if (prof?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
    await sendEmail(prof.email, `Seat secured — ${training?.title}`, renderEmail({
      kicker: "Payment confirmed",
      heading: "You're in.",
      paragraphs: [
        `Hi ${(prof.full_name || "there").split(" ")[0]} — your payment for "${training?.title}" is confirmed and your seat is registered.`,
        "Everything about the session — schedule, links, and materials — lives in your portal."
      ],
      details: [["Amount", `${pay.currency === "NGN" ? "₦" : "$"}${Number(pay.amount).toLocaleString()}`]],
      cta: { label: "View my trainings", url: `${appUrl}/portal/seeker/trainings` }
    }));
  }
  await admin.from("activity_log").insert({
    actor_id: actorId, action: "Training payment confirmed", entity: "payment", entity_id: paymentId,
    meta: { training: training?.title }
  });
  return { ok: true };
}
