"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Bank = { bank: string; account_name: string; account_number: string; note?: string };
type Props = {
  plan: { name: string; price_ngn: number; price_usd: number; features: string[] };
  status: string | null;
  periodEnd: string | null;
  bankNgn: Bank | null;
  bankUsd: Bank | null;
};

export function SubscriptionPanel({ plan, status, periodEnd, bankNgn, bankUsd }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [lane, setLane] = useState<"paystack" | "manual">("paystack");
  const [reference, setReference] = useState("");
  const [proofId, setProofId] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const active = status === "active" && periodEnd && new Date(periodEnd) > new Date();
  const pending = status === "pending_confirmation" || submitted;
  const price = currency === "NGN" ? `₦${Number(plan.price_ngn).toLocaleString()}` : `$${Number(plan.price_usd)}`;
  const bank = currency === "NGN" ? bankNgn : bankUsd;
  const cbStatus = sp.get("status");

  async function payPaystack() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/pay/paystack/init", { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); setBusy(false); return; }
    window.location.href = json.url;
  }

  async function uploadProof(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "payment_proof");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); return; }
    setProofId(json.document.id); setProofName(file.name);
  }

  async function submitManual() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/pay/manual", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, proof_document_id: proofId, reference })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setSubmitted(true); router.refresh();
  }

  if (active) {
    return (
      <div className="card p-8 max-w-xl bg-ink text-white border-ink">
        <div className="text-xs font-bold uppercase tracking-widest text-[#FFB4AC] mb-3">Subscription active</div>
        <div className="font-display font-semibold text-3xl mb-2">{plan.name}</div>
        <p className="text-white/60 text-sm mb-5">
          All AI tools unlocked until <b className="text-white">{new Date(periodEnd!).toLocaleDateString("en-GB", { dateStyle: "long" })}</b>.
        </p>
        <a href="/portal/seeker/ai-tools" className="btn-coral">Open AI tools →</a>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      {cbStatus === "success" && (
        <div className="card p-4 mb-5 border-ink bg-ink text-white text-sm">Payment confirmed — your toolkit is unlocked. 🎉</div>
      )}
      {cbStatus === "failed" && (
        <div className="card p-4 mb-5 text-sm text-coral">Payment didn&rsquo;t complete: {sp.get("msg") ?? "try again."}</div>
      )}
      {pending && (
        <div className="card p-4 mb-5 text-sm">
          <b>Transfer submitted.</b> Our team confirms payments within one business day — the toolkit unlocks automatically once confirmed.
        </div>
      )}

      <div className="card p-8">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="font-display font-semibold text-2xl">{plan.name}</div>
          <div className="flex rounded-pill border border-line overflow-hidden text-sm font-bold">
            {(["NGN", "USD"] as const).map((c) => (
              <button key={c} onClick={() => { setCurrency(c); setLane(c === "USD" ? "manual" : lane); }}
                className={`px-4 h-9 ${currency === c ? "bg-ink text-white" : "bg-white"}`}>
                {c === "NGN" ? "₦ NGN" : "$ USD"}
              </button>
            ))}
          </div>
        </div>
        <div className="numeral mb-1">{price}<span className="text-lg text-muted font-sans font-semibold">/month</span></div>
        <ul className="text-sm text-muted space-y-1.5 my-5">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2"><span className="text-coral">✓</span>{f}</li>
          ))}
        </ul>

        {/* lanes */}
        <div className="flex gap-2 mb-5">
          {currency === "NGN" && (
            <button onClick={() => setLane("paystack")}
              className={`px-4 h-10 rounded-pill border text-sm font-semibold ${lane === "paystack" ? "bg-coral border-coral text-white" : "border-line"}`}>
              Pay with card / Paystack
            </button>
          )}
          <button onClick={() => setLane("manual")}
            className={`px-4 h-10 rounded-pill border text-sm font-semibold ${lane === "manual" ? "bg-coral border-coral text-white" : "border-line"}`}>
            Bank transfer
          </button>
        </div>

        {lane === "paystack" && currency === "NGN" ? (
          <button className="btn-coral w-full justify-center !h-13" onClick={payPaystack} disabled={busy}>
            {busy ? "Connecting…" : `Pay ${price} securely →`}
          </button>
        ) : (
          <div>
            {bank && bank.account_number !== "SET_ME" ? (
              <div className="rounded-xl border border-line p-4 text-sm mb-4">
                <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
                  Transfer {price} to
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-y-1">
                  <span className="text-muted">Bank</span><b>{bank.bank}</b>
                  <span className="text-muted">Account name</span><b>{bank.account_name}</b>
                  <span className="text-muted">Account no.</span><b className="tracking-wider">{bank.account_number}</b>
                </div>
                {bank.note && <p className="text-xs text-muted-2 mt-2">{bank.note}</p>}
              </div>
            ) : (
              <p className="text-sm text-coral mb-4">
                {currency} transfer details aren&rsquo;t configured yet — contact support, or pay via Paystack.
              </p>
            )}
            <label className="label">Transfer reference / narration (optional)</label>
            <input className="input mb-4" placeholder="e.g. MJH-JOHN-0717"
              value={reference} onChange={(e) => setReference(e.target.value)} />
            <label className="label">Upload proof of payment (screenshot or receipt)</label>
            <label className="card border-dashed flex items-center gap-3 p-4 cursor-pointer hover:border-coral transition mb-5">
              <input type="file" className="hidden" accept="image/*,.pdf"
                onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
              <span className="w-9 h-9 rounded-full bg-coral-soft text-coral grid place-items-center">↑</span>
              <span className="text-sm font-medium">{proofName ?? "Choose file — compressed automatically"}</span>
            </label>
            <button className="btn-coral w-full justify-center" onClick={submitManual}
              disabled={busy || (!proofId && !reference)}>
              {busy ? "Submitting…" : "I've transferred — submit for confirmation →"}
            </button>
          </div>
        )}
        {err && <p className="text-coral text-sm mt-4">{err}</p>}
      </div>
    </div>
  );
}
