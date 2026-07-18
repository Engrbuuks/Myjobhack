"use client";
import { useState } from "react";
import Link from "next/link";

type Field = { id: string; label: string; field_type: string; required: boolean; options: string[] | null };

export function GuestApplyForm({ jobId, fields }: { jobId: string; fields: Field[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
    fd.append("phone", phone); fd.append("answers", JSON.stringify(answers));
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
      <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-7">
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
          <div className="rounded-xl bg-white/[.06] border border-white/10 p-5 mb-5">
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-2">Don't stop here</div>
            <p className="text-sm text-white/70 leading-relaxed">
              Members track every application live, get auto-matched to new roles, receive training invites in their niche, and can sharpen their resume with the Career Toolkit. It's free and takes two minutes.
            </p>
          </div>
          <Link href="/signup" className="btn-coral w-full justify-center !h-12">Create my free profile →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-6">
      <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-coral/[.14] blur-3xl" />
      <div className="relative">
        <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-1">Apply now</div>
        <div className="font-display font-semibold text-xl mb-5">No account needed.</div>

        <div className="space-y-3 mb-3">
          <input className="gin" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="gin" type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="gin" placeholder="Phone / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
          width: 100%; height: 46px; border-radius: 14px;
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
