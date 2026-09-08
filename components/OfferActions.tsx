"use client";
import { useState } from "react";

/**
 * Accept or decline.
 *
 * Accepting requires typing the full name rather than pressing a button
 * alone. That is what makes it a signature: a deliberate act producing a
 * record of what the person entered, rather than a click anyone forwarding
 * the email could make by accident.
 */
export function OfferActions({ token, name }: { token: string; name: string }) {
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(action: "accept" | "decline") {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/public/offer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, full_name: typed, reason })
      });
      const j = await res.json().catch(() => null);
      if (res.ok) setDone(action);
      else setErr(j?.error ?? "That did not work. Try again, or reply to our email.");
    } catch {
      setErr("No connection. Check your network and try again.");
    }
    setBusy(false);
  }

  if (done === "accept") return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-full bg-coral-soft text-coral grid place-items-center text-2xl mx-auto mb-4">✓</div>
      <p className="font-semibold text-lg mb-1">Offer accepted</p>
      <p className="text-sm text-muted">We will be in touch with what happens next.</p>
    </div>
  );
  if (done === "decline") return (
    <div className="text-center">
      <p className="font-semibold text-lg mb-1">Offer declined</p>
      <p className="text-sm text-muted">Thank you for letting us know.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-pill border border-line overflow-hidden">
        {([["accept", "Accept"], ["decline", "Decline"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setMode(v)}
            className={`px-5 h-10 text-sm font-semibold transition ${
              mode === v ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === "accept" ? (
        <>
          <div>
            <label className="label !text-xs">Type your full name to sign</label>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)}
              placeholder={name} autoComplete="name" />
            <p className="text-xs text-muted-2 mt-1.5">
              Your name and the date are added to the letter as your signature.
            </p>
          </div>
          <button className="btn-coral w-full justify-center" disabled={busy || typed.trim().length < 3}
            onClick={() => go("accept")}>
            {busy ? "Recording…" : "Accept this offer"}
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="label !text-xs">Reason, if you would like to share one</label>
            <textarea className="input !h-auto py-2" rows={3} value={reason}
              onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </div>
          <button className="btn-ghost w-full justify-center" disabled={busy} onClick={() => go("decline")}>
            {busy ? "Recording…" : "Decline this offer"}
          </button>
        </>
      )}

      {err && <p className="text-sm text-coral">{err}</p>}
    </div>
  );
}
