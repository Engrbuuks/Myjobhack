"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrainingPay({ trainingId, priceNgn, priceUsd, bankNgn, bankUsd }: {
  trainingId: string; priceNgn: number; priceUsd: number;
  bankNgn: any; bankUsd: any;
}) {
  const router = useRouter();
  const [openPay, setOpenPay] = useState(false);
  const [lane, setLane] = useState<"NGN" | "USD">("NGN");
  const [proofId, setProofId] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number; final: number; describe: string } | null>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function applyCoupon() {
    if (!coupon.trim()) return;
    setChecking(true); setCouponErr(null);
    const res = await fetch("/api/coupons/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: coupon, training_id: trainingId }) });
    const j = await res.json();
    setChecking(false);
    if (!res.ok) { setApplied(null); setCouponErr(j.error ?? "That code didn't work."); return; }
    setApplied({ code: j.code, discount: j.discount, final: j.final, describe: j.describe });
  }

  const price = lane === "NGN" ? priceNgn : priceUsd;
  const bank = lane === "NGN" ? bankNgn : bankUsd;
  const sym = lane === "NGN" ? "₦" : "$";

  async function uploadProof(file: File) {
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "payment_proof");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); return; }
    setProofId(json.document.id); setProofName(file.name);
  }

  async function pay(method: string) {
    setBusy(method); setErr(null);
    const res = await fetch("/api/pay/training", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ training_id: trainingId, method, proof_document_id: proofId, coupon_code: applied?.code ?? null })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return; }
    if (json.free) { setDone(true); router.refresh(); return; }
    if (json.mode === "paystack") { window.location.href = json.authorization_url; return; }
    setDone(true); router.refresh();
  }

  if (done) {
    return (
      <div className="rounded-xl bg-paper border border-line p-4 text-sm">
        ✓ Transfer submitted — your seat is registered the moment the team confirms it.
      </div>
    );
  }

  if (!openPay) {
    return (
      <button className="btn-coral !h-11" onClick={() => setOpenPay(true)}>
        {priceNgn > 0 ? `₦${priceNgn.toLocaleString()}` : `$${priceUsd}`} — Pay & register →
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl bg-paper border border-line p-4 mt-2">
      <div className="flex rounded-pill border border-line overflow-hidden text-xs font-bold mb-3 w-44">
        {(["NGN", "USD"] as const).map((c) => (
          <button key={c} className={`flex-1 h-9 ${lane === c ? "bg-coral text-white" : "text-muted"}`}
            onClick={() => setLane(c)}>{c === "NGN" ? "₦ NGN" : "$ USD"}</button>
        ))}
      </div>
      <div className="text-sm mb-3">
        Amount:{" "}
        {applied && lane === "NGN" ? (
          <>
            <span className="line-through text-muted-2">₦{Number(price).toLocaleString()}</span>{" "}
            <b>₦{Number(applied.final).toLocaleString()}</b>{" "}
            <span className="text-coral text-xs font-semibold">({applied.describe})</span>
          </>
        ) : (
          <b>{sym}{Number(price).toLocaleString()}</b>
        )}
      </div>

      {lane === "NGN" && (
        <div className="mb-3">
          {applied ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-pill bg-mint text-ink font-bold">{applied.code} applied</span>
              <button className="text-muted-2 underline" onClick={() => { setApplied(null); setCoupon(""); }}>remove</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="input !h-9 text-xs uppercase flex-1" placeholder="Coupon code (optional)"
                value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponErr(null); }} />
              <button className="btn-ghost !h-9 text-xs" onClick={applyCoupon} disabled={checking || !coupon.trim()}>
                {checking ? "…" : "Apply"}
              </button>
            </div>
          )}
          {couponErr && <p className="text-coral text-xs mt-1.5">{couponErr}</p>}
        </div>
      )}
      {lane === "NGN" && (
        <button className="btn-coral !h-10 w-full justify-center mb-3" disabled={busy !== null}
          onClick={() => pay("paystack")}>
          {busy === "paystack" ? "Redirecting…" : "Pay with card — Paystack →"}
        </button>
      )}
      {bank?.account_number && (
        <div className="text-xs text-muted leading-relaxed mb-3">
          Or transfer to: <b>{bank.bank}</b> · {bank.account_name} · <b>{bank.account_number}</b>
        </div>
      )}
      <label className="flex items-center gap-2.5 rounded-xl border border-dashed border-line p-3 cursor-pointer hover:border-coral transition mb-3">
        <input type="file" className="hidden" accept="image/*,.pdf"
          onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
        <span className="w-7 h-7 rounded-full bg-coral-soft text-coral grid place-items-center text-xs">↑</span>
        <span className="text-xs">{proofName ?? "Upload transfer proof"}</span>
      </label>
      <button className="inline-flex items-center justify-center w-full h-10 rounded-pill border border-line text-xs font-bold hover:border-coral transition"
        disabled={busy !== null}
        onClick={() => pay(lane === "NGN" ? "manual_transfer_ngn" : "manual_transfer_usd")}>
        {busy?.startsWith("manual") ? "Submitting…" : "I've transferred — submit for confirmation"}
      </button>
      {err && <p className="text-coral text-xs mt-2">{err}</p>}
    </div>
  );
}
