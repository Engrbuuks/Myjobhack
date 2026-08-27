"use client";
import { useState } from "react";
import Link from "next/link";
import { COUNTRIES } from "@/lib/geo";

export function TrainingInterest({ trainingId, price }: { trainingId: string; price: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/public/interest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ training_id: trainingId, name, email, phone, country, message, website: "" })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-card border border-white/10 bg-white/[.05] p-6">
        <div className="w-11 h-11 rounded-full bg-coral grid place-items-center text-lg mb-4">✓</div>
        <div className="font-display font-semibold text-xl mb-2">You're on the list.</div>
        <p className="text-white/60 text-sm leading-relaxed mb-5">
          Check your inbox — we've sent confirmation. Our team follows up with joining details.
        </p>
        <Link href="/join?ref=training-interest" className="btn-coral w-full justify-center">Create my free profile →</Link>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-white/10 bg-white/[.05] p-6">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC]">Reserve a seat</span>
        <span className="font-display font-semibold text-xl">{price}</span>
      </div>
      <p className="text-white/50 text-xs leading-relaxed mb-5">
        Register interest and we'll send joining details. No payment now.
      </p>
      <div className="space-y-3">
        <input className="tin" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="tin" type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="tin" placeholder="Phone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select className="tin" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="" className="text-ink">Select country…</option>
          {COUNTRIES.map((c) => <option key={c} value={c} className="text-ink">{c}</option>)}
        </select>
        <textarea className="tin !h-auto py-3" rows={2} placeholder="Anything you'd like us to know (optional)"
          value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <button className="btn-coral w-full justify-center !h-12 mt-4" onClick={submit}
        disabled={busy || !name || !email}>
        {busy ? "Sending…" : "Register my interest →"}
      </button>
      {err && <p className="text-coral text-sm mt-3">{err}</p>}
      <p className="text-[11px] text-white/35 mt-4 text-center">
        Already a member? <Link href="/login" className="text-coral font-semibold">Sign in</Link> to enrol directly.
      </p>
      <style jsx>{`
        .tin { width:100%; max-width:100%; box-sizing:border-box; height:46px; border-radius:14px;
          background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12);
          padding:0 16px; font-size:14px; color:#fff; outline:none; transition:border-color .2s; }
        .tin::placeholder { color:rgba(255,255,255,.35); }
        .tin:focus { border-color:rgba(252,86,71,.55); }
        textarea.tin { height:auto; padding-top:12px; }
      `}</style>
    </div>
  );
}
