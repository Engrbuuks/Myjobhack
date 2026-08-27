"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = {
  id: string; label: string; field_type: string;
  options: string[] | null; required: boolean;
};

export function DynamicApplicationForm({ jobId, fields, hasResume }: {
  jobId: string; fields: Field[]; hasResume: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string } | null>(null);
  const set = (id: string, v: any) => setAnswers((a) => ({ ...a, [id]: v }));

  async function uploadFile(fieldId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "other");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); return; }
    set(fieldId, json.document.id);
    setAnswers((a) => ({ ...a, [`${fieldId}__name`]: file.name }));
  }

  async function submit() {
    setBusy(true); setErr(null);
    const clean = Object.fromEntries(Object.entries(answers).filter(([k]) => !k.endsWith("__name")));
    const res = await fetch("/api/jobs/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, answers: clean })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setDone(json); router.refresh();
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <div className={`w-12 h-12 rounded-full grid place-items-center text-xl mx-auto mb-4 ${
          done.status === "shortlisted" ? "bg-ink text-white" : "bg-coral-soft text-coral"}`}>✓</div>
        <div className="font-display font-semibold text-xl mb-1">
          {done.status === "shortlisted" ? "Application shortlisted" : "Application received"}
        </div>
        <p className="text-sm text-muted max-w-sm mx-auto">
          {done.status === "shortlisted"
            ? "You met the role's requirements — your application went straight to the shortlist."
            : done.status === "rules_failed"
            ? "Submitted. Some requirements weren't met, but the team still sees every application."
            : "Submitted. The hiring team will review and update your status here."}
        </p>
      </div>
    );
  }

  if (!hasResume) {
    return (
      <div className="card p-6 text-sm">
        <b>Resume required.</b>{" "}
        <a href="/portal/seeker/profile" className="text-coral font-semibold">Upload it in your profile →</a>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Apply for this role</div>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.id}>
            <label className="label">{f.label}{f.required && " *"}</label>
            {f.field_type === "text" && (
              <input className="input" value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} />)}
            {f.field_type === "textarea" && (
              <textarea className="input !h-auto py-3" rows={4} value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} />)}
            {f.field_type === "number" && (
              <input className="input" type="number" value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} />)}
            {f.field_type === "date" && (
              <input className="input" type="date" value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} />)}
            {f.field_type === "boolean" && (
              <div className="flex gap-2">
                {["Yes", "No"].map((o) => (
                  <button key={o} type="button"
                    className={`px-5 h-10 rounded-pill border text-sm font-semibold ${
                      answers[f.id] === (o === "Yes") ? "bg-coral border-coral text-white" : "border-line"}`}
                    onClick={() => set(f.id, o === "Yes")}>{o}</button>
                ))}
              </div>)}
            {f.field_type === "select" && (
              <select className="input" value={answers[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>)}
            {f.field_type === "multiselect" && (
              <div className="flex flex-wrap gap-2">
                {(f.options ?? []).map((o) => {
                  const cur: string[] = answers[f.id] ?? [];
                  const on = cur.includes(o);
                  return (
                    <button key={o} type="button"
                      className={`px-4 h-10 rounded-pill border text-sm font-semibold ${
                        on ? "bg-coral border-coral text-white" : "border-line"}`}
                      onClick={() => set(f.id, on ? cur.filter((x) => x !== o) : [...cur, o])}>{o}</button>
                  );
                })}
              </div>)}
            {f.field_type === "file" && (
              <label className="card border-dashed flex items-center gap-3 p-3 cursor-pointer hover:border-coral transition">
                <input type="file" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(f.id, e.target.files[0])} />
                <span className="w-8 h-8 rounded-full bg-coral-soft text-coral grid place-items-center">↑</span>
                <span className="text-sm">{answers[`${f.id}__name`] ?? "Upload file"}</span>
              </label>)}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-2 mt-4 mb-4">Your profile resume is attached automatically.</p>
      <button className="btn-coral w-full justify-center" onClick={submit} disabled={busy}>
        {busy ? "Submitting…" : "Submit application →"}
      </button>
      {err && <p className="text-coral text-sm mt-3">{err}</p>}
    </div>
  );
}
