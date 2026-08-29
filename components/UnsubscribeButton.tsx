"use client";
import { useState } from "react";

export function UnsubscribeButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/public/unsubscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (res.ok) setDone(true);
      else setErr("That didn't work. Try again, or reply to any of our emails and we'll remove you.");
    } catch {
      setErr("No connection. Check your network and try again.");
    }
    setBusy(false);
  }

  if (done) return (
    <div>
      <div className="w-14 h-14 rounded-full bg-coral-soft text-coral grid place-items-center text-2xl mx-auto mb-4">✓</div>
      <p className="font-semibold text-lg">Done — you won&rsquo;t hear from us again.</p>
    </div>
  );

  return (
    <>
      <button className="btn-coral w-full justify-center" onClick={go} disabled={busy}>
        {busy ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      {err && <p className="text-sm text-coral mt-3">{err}</p>}
    </>
  );
}
