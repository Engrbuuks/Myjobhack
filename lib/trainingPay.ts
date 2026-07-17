import { renderEmail } from "@/lib/email";
import { sendEmail } from "@/lib/resend";

/** Confirm a training payment: enroll, notify, email. Idempotent. */
export async function enrollAfterPayment(admin: any, paymentId: string, actorId: string) {
  const { data: pay } = await admin.from("payments")
    .select("id, status, profile_id, training_id, amount, currency").eq("id", paymentId).single();
  if (!pay?.training_id) return { error: "Not a training payment" };
  if (pay.status === "confirmed") return { ok: true, already: true };

  await admin.from("payments").update({
    status: "confirmed", confirmed_at: new Date().toISOString()
  }).eq("id", paymentId);

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
