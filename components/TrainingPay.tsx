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
      body: JSON.stringify({ training_id: trainingId, method, proof_document_id: proofId })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return; }
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
      <div className="text-sm mb-3">Amount: <b>{sym}{Number(price).toLocaleString()}</b></div>
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
