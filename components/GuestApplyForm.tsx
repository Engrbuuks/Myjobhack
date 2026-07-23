"use client";
import { useState } from "react";
import Link from "next/link";
import { LocationPicker } from "@/components/LocationPicker";

type Field = { id: string; label: string; field_type: string; required: boolean; options: string[] | null };

export function GuestApplyForm({ jobId, fields }: { jobId: string; fields: Field[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [city, setCity] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [resume, setResume] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | { shortlisted: boolean }>(null);

  const setA = (id: string, v: any) => setAnswers((a) => ({ ...a, [id]: v }));

  async function submit() {
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append("job_id", jobId); fd.append("name", name); fd.append("email", email);
    fd.append("phone", phone); fd.append("country", country); fd.append("city", city);
    fd.append("answers", JSON.stringify(answers));
    fd.append("website", ""); // honeypot
    if (resume) fd.append("resume", resume);
    const res = await fetch("/api/public/apply", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setDone({ shortlisted: !!json.shortlisted });
  }

  if (done) {
    return (
      <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-6 sm:p-7 min-w-0">
        <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-coral/[.16] blur-3xl" />
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-coral grid place-items-center text-xl mb-4">✓</div>
          <div className="font-display font-semibold text-2xl mb-2">
            {done.shortlisted ? "Application in — and you're shortlisted." : "Application in."}
          </div>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            {done.shortlisted
              ? "You met the role's requirements, so our system shortlisted you instantly. The hiring team sees you at the top."
              : "The hiring team has it. Watch your inbox."}
          </p>
          {/* This is the moment of maximum motivation — they have just applied.
              Lead with the assessment, because that is what actually makes them
              competitive for the role they just went for, not generic features. */}
          <div className="rounded-xl bg-white/[.06] border border-white/10 p-5 mb-5">
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-2">
              One thing worth doing now
            </div>
            <p className="text-sm text-white/75 leading-relaxed mb-3">
              Employers on MYJOBHACK rank candidates by <b className="text-white">proven competency</b>, not
              by CV claims. Right now your application carries no competency band — so you're being
              read the same way you would be anywhere else.
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              Create a free profile and take one practical assessment in your field. It takes about
              35 minutes, and it applies to <b className="text-white/90">every</b> role you go for here —
              including this one.
            </p>
          </div>
          <Link href="/signup" className="btn-coral w-full justify-center !h-12">
            Create my profile & get assessed →
          </Link>
          <p className="text-xs text-white/40 mt-3 text-center">
            Free. Your application stands either way.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-5 sm:p-6 min-w-0">
      <div className="pointer-events-none absolute -top-16 -right-12 w-[60vw] max-w-56 aspect-square rounded-full bg-coral/[.14] blur-3xl" />
      <div className="relative">
        <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-1">Apply now</div>
        <div className="font-display font-semibold text-xl mb-5">No account needed.</div>

        <div className="space-y-3 mb-3">
          <input className="gin" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="gin" type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="gin" placeholder="Phone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <LocationPicker dark labels={false} required country={country} city={city} onCountry={setCountry} onCity={setCity} />
        </div>

        {fields.map((f) => (
          <div key={f.id} className="mb-3">
            <label className="block text-[11px] font-bold text-white/55 mb-1.5">
              {f.label}{f.required && <span className="text-coral"> *</span>}
            </label>
            {f.field_type === "textarea" ? (
              <textarea className="gin !h-auto py-3" rows={3} value={answers[f.id] ?? ""} onChange={(e) => setA(f.id, e.target.value)} />
            ) : f.field_type === "select" ? (
              <select className="gin" value={answers[f.id] ?? ""} onChange={(e) => setA(f.id, e.target.value)}>
                <option value="" className="text-ink">Choose…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o} className="text-ink">{o}</option>)}
              </select>
            ) : f.field_type === "multiselect" ? (
              <div className="flex flex-wrap gap-2">
                {(f.options ?? []).map((o) => {
                  const on = (answers[f.id] ?? []).includes(o);
                  return (
                    <button key={o} type="button"
                      className={`px-3 h-9 rounded-pill border text-xs font-semibold transition ${
                        on ? "bg-coral border-coral text-white" : "border-white/20 text-white/60"}`}
                      onClick={() => setA(f.id, on ? (answers[f.id] ?? []).filter((x: string) => x !== o) : [...(answers[f.id] ?? []), o])}>
                      {o}
                    </button>
                  );
                })}
              </div>
            ) : f.field_type === "yesno" ? (
              <div className="flex gap-2">
                {["Yes", "No"].map((o) => (
                  <button key={o} type="button"
                    className={`px-5 h-10 rounded-pill border text-sm font-bold transition ${
                      answers[f.id] === o ? "bg-coral border-coral text-white" : "border-white/20 text-white/60"}`}
                    onClick={() => setA(f.id, o)}>{o}</button>
                ))}
              </div>
            ) : (
              <input className="gin" type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                value={answers[f.id] ?? ""} onChange={(e) => setA(f.id, e.target.value)} />
            )}
          </div>
        ))}

        <label className="flex items-center gap-3 rounded-xl border border-dashed border-white/25 p-4 cursor-pointer hover:border-coral transition mb-4 mt-4">
          <input type="file" className="hidden" accept=".pdf,.doc,.docx"
            onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
          <span className="w-9 h-9 rounded-full bg-coral/20 text-coral grid place-items-center shrink-0">↑</span>
          <span className="text-sm text-white/70 truncate">{resume?.name ?? "Attach resume * — PDF or Word, max 5MB"}</span>
        </label>

        <button className="btn-coral w-full justify-center !h-12" onClick={submit}
          disabled={busy || !name || !email || !resume}>
          {busy ? "Submitting…" : "Submit application →"}
        </button>
        {err && <p className="text-coral text-sm mt-3">{err}</p>}
        <p className="text-[11px] text-white/35 mt-4 leading-relaxed">
          Prefer superpowers? <Link href="/signup" className="text-coral font-semibold">Members</Link> get one-click applications, live tracking, and roles that find them.
        </p>
      </div>
      <style jsx>{`
        .gin {
          width: 100%; max-width: 100%; box-sizing: border-box; height: 46px; border-radius: 14px;
          background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
          padding: 0 16px; font-size: 14px; color: #fff; outline: none;
          transition: border-color .2s;
        }
        .gin::placeholder { color: rgba(255,255,255,.35); }
        .gin:focus { border-color: rgba(252,86,71,.55); }
        textarea.gin { height: auto; padding-top: 12px; }
      `}</style>
    </div>
  );
}
