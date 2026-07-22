/**
 * Reusable Paystack core — one place to initialize any payment.
 * Every revenue point (unlock, placement, assessment, subscription, elite)
 * calls initPaystack() with a `purpose` + metadata; the webhook dispatches
 * on that purpose to settle it. Keeps all payment logic consistent.
 */
export type PayPurpose =
  | "seeker_subscription" | "employer_subscription" | "training"
  | "profile_unlock" | "placement_fee" | "assessment_order"
  | "job_assessment" | "elite_premium";

export async function initPaystack(opts: {
  email: string;
  amount_ngn: number;                 // in naira (we convert to kobo)
  purpose: PayPurpose;
  metadata: Record<string, any>;      // must carry what the webhook needs
  callback_url?: string;
}): Promise<{ ok: boolean; authorization_url?: string; reference?: string; error?: string }> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return { ok: false, error: "Payments not configured." };
  if (!opts.amount_ngn || opts.amount_ngn <= 0) return { ok: false, error: "Invalid amount." };

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: opts.email,
      amount: Math.round(opts.amount_ngn * 100),  // kobo
      currency: "NGN",
      metadata: { purpose: opts.purpose, ...opts.metadata },
      callback_url: opts.callback_url ?? `${process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co"}/pay/return`
    })
  });
  const json = await res.json();
  if (!res.ok || !json?.status) return { ok: false, error: json?.message ?? "Could not start payment." };
  return { ok: true, authorization_url: json.data.authorization_url, reference: json.data.reference };
}

/** Server-side verify (used by the return page and as a webhook backstop). */
export async function verifyPaystack(reference: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return { ok: false, error: "not configured" };
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const json = await res.json();
  if (!res.ok || !json?.status) return { ok: false, error: json?.message ?? "verify failed" };
  return { ok: json.data?.status === "success", data: json.data };
}
