import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Coupon validation. Deliberately a single source of truth: the preview shown
 * to the user and the price charged at checkout both call this, so what someone
 * is quoted is always what they pay.
 */

export type CouponResult =
  | { ok: true; coupon_id: string; code: string; label: string | null;
      original: number; discount: number; final: number; describe: string }
  | { ok: false; error: string };

export async function validateCoupon(opts: {
  code: string;
  training_id: string;
  profile_id: string;
  amount: number;              // the undiscounted price, in naira
}): Promise<CouponResult> {
  const code = (opts.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const admin = createAdminClient();

  // A training-specific code wins over a global one with the same word.
  const { data: matches } = await admin.from("coupons")
    .select("*")
    .eq("active", true)
    .or(`training_id.eq.${opts.training_id},training_id.is.null`);

  const coupon = (matches ?? [])
    .filter((c: any) => String(c.code).toUpperCase() === code)
    .sort((a: any, b: any) => (a.training_id ? -1 : 1) - (b.training_id ? -1 : 1))[0];

  if (!coupon) return { ok: false, error: "That code isn't recognised." };

  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now)
    return { ok: false, error: "This code isn't active yet." };
  if (coupon.expires_at && new Date(coupon.expires_at) < now)
    return { ok: false, error: "This code has expired." };

  if (coupon.max_redemptions != null && coupon.redemptions >= coupon.max_redemptions)
    return { ok: false, error: "This code has been fully redeemed." };

  if (Number(opts.amount) < Number(coupon.min_amount_ngn))
    return { ok: false, error: `This code applies to trainings over ₦${Number(coupon.min_amount_ngn).toLocaleString()}.` };

  // Per-person limit.
  const { count: used } = await admin.from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", coupon.id).eq("profile_id", opts.profile_id);
  if ((used ?? 0) >= Number(coupon.max_per_user))
    return { ok: false, error: "You've already used this code." };

  // Work out the discount, never below zero and never above the price.
  const original = Math.round(Number(opts.amount));
  let discount = coupon.kind === "percent"
    ? Math.round(original * (Number(coupon.value) / 100))
    : Math.round(Number(coupon.value));
  discount = Math.max(0, Math.min(discount, original));
  const final = original - discount;

  return {
    ok: true,
    coupon_id: coupon.id,
    code: String(coupon.code).toUpperCase(),
    label: coupon.label ?? null,
    original, discount, final,
    describe: coupon.kind === "percent"
      ? `${Number(coupon.value)}% off`
      : `₦${Number(coupon.value).toLocaleString()} off`
  };
}

/** Records a redemption once payment is settled. */
export async function recordRedemption(opts: {
  coupon_id: string; profile_id: string; training_id: string | null;
  original: number; discount: number; final: number; payment_id?: string | null;
}) {
  const admin = createAdminClient();
  await admin.from("coupon_redemptions").insert({
    coupon_id: opts.coupon_id, profile_id: opts.profile_id,
    training_id: opts.training_id, original_amount: opts.original,
    discount_amount: opts.discount, final_amount: opts.final,
    payment_id: opts.payment_id ?? null
  });
}
