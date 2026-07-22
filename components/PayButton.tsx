"use client";
import { useState } from "react";

/**
 * Universal "Pay now" button. Calls /api/pay/checkout with a purpose + context,
 * then redirects the user to Paystack. On return, the webhook settles it.
 */
export function PayButton({
  purpose, refData = {}, label = "Pay now", className = "btn-coral",
  onError
}: {
  purpose: string;
  refData?: Record<string, any>;
  label?: string;
  className?: string;
  onError?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/pay/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, ...refData })
      });
      const json = await res.json();
      if (!res.ok || !json.authorization_url) {
        const m = json.error ?? "Could not start payment.";
        setErr(m); onError?.(m); setBusy(false); return;
      }
      window.location.href = json.authorization_url; // → Paystack
    } catch {
      setErr("Network error."); setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button className={className} onClick={pay} disabled={busy}>
        {busy ? "Redirecting…" : label}
      </button>
      {err && <span className="text-xs text-coral">{err}</span>}
    </span>
  );
}
