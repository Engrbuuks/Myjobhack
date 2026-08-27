"use client";
import { useState, useEffect, useRef } from "react";

/**
 * One tap, one answer.
 *
 * `auto` carries the option the applicant already chose in the email, so the
 * tap they made there is the only one they make. It submits on load and shows
 * the result — but only once, guarded against React's double-invoked effects
 * in development, which would otherwise fire two writes.
 */
export function AnswerButtons({ token, options, auto }: {
  token: string; options: string[]; auto?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fired = useRef(false);

  async function submit(value: string) {
    setBusy(value); setErr(null);
    try {
      const res = await fetch("/api/public/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, value })
      });
      const j = await res.json();
      if (res.ok) setDone(value);
      else setErr(j.error ?? "That didn't save. Try tapping again.");
    } catch {
      setErr("No connection. Check your network and tap again.");
    }
    setBusy(null);
  }

  useEffect(() => {
    if (auto && options.includes(auto) && !fired.current) {
      fired.current = true;
      submit(auto);
    }
  }, [auto, options]);

  if (done) {
    return (
      <div>
        <div className="w-14 h-14 rounded-full bg-coral-soft text-coral grid place-items-center text-2xl mx-auto mb-4">✓</div>
        <p className="font-semibold text-lg mb-1">Thank you</p>
        <p className="text-sm text-muted">
          Recorded as <strong className="text-ink">{done}</strong>. Nothing else is needed from you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {options.map((o) => (
        <button key={o} onClick={() => submit(o)} disabled={!!busy}
          className="btn-coral w-full justify-center !h-13 py-3 disabled:opacity-60">
          {busy === o ? "Saving…" : o}
        </button>
      ))}
      {err && <p className="text-sm text-coral pt-1">{err}</p>}
    </div>
  );
}
