"use client";
import { useState } from "react";

export type ComposedJob = {
  description: string;
  key_requirements: string[];
  role_level: string;
  employment_type: string;
  work_mode: string;
  niche_id: string | null;
  salary_note: string;
  salary_currency: string;
  screening_questions: Array<{ label: string; type: string; required: boolean; options?: string[]; why?: string }>;
  interview_focus: string[];
  seo_summary: string;
};

export function JobComposer({
  title, company, location, onApply
}: {
  title: string; company?: string | null; location?: string;
  onApply: (draft: ComposedJob, opts: { questions: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComposedJob | null>(null);
  const [useQuestions, setUseQuestions] = useState(true);

  async function compose() {
    if (!title.trim()) { setErr("Add a job title first — that's all I need to start."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/ai/compose-job", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, company, location, notes })
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Could not draft this one."); return; }
      setDraft(json);
    } catch {
      setErr("Network trouble — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-coral/40 bg-coral-soft/40 hover:bg-coral-soft transition p-4 text-left group">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-coral text-white grid place-items-center shrink-0">✦</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Draft this posting for me</span>
            <span className="block text-xs text-muted-2 mt-0.5">
              Give me the title and I'll write the description, requirements, screening questions and the rest. You review before anything is saved.
            </span>
          </span>
          <span className="text-coral font-bold text-sm group-hover:translate-x-0.5 transition">Open →</span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-coral/30 bg-coral-soft/30 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-coral text-white grid place-items-center text-xs">✦</span>
            Draft with AI
          </div>
          <p className="text-xs text-muted-2 mt-1">
            Working from: <b className="text-ink">{title || "no title yet"}</b>
            {location ? ` · ${location}` : ""}{company ? ` · ${company}` : ""}
          </p>
        </div>
        <button type="button" className="text-muted-2 hover:text-ink text-sm" onClick={() => setOpen(false)}>✕</button>
      </div>

      {!draft && (
        <>
          <label className="label">Anything specific to include? <span className="font-normal text-muted-2">(optional)</span></label>
          <textarea className="input !h-auto py-3" rows={3}
            placeholder="e.g. must have run paid campaigns with a budget over ₦2m; team of four; reports to the Head of Growth; hybrid two days in Yaba"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" className="btn-coral mt-3" onClick={compose} disabled={busy || !title.trim()}>
            {busy ? "Writing the posting…" : "Draft the posting →"}
          </button>
          {err && <p className="text-coral text-sm mt-3">{err}</p>}
          <p className="text-xs text-muted-2 mt-3">
            Nothing is saved until you apply it — and you can edit every field afterwards.
          </p>
        </>
      )}

      {draft && (
        <div className="space-y-4">
          <div className="rounded-lg bg-white border border-line p-4 max-h-64 overflow-auto">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-2">Description</div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{draft.description}</pre>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-white border border-line p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-2">
                Key requirements ({draft.key_requirements?.length ?? 0})
              </div>
              <ul className="space-y-1.5">
                {(draft.key_requirements ?? []).map((r, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-coral">✓</span>{r}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-white border border-line p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-2">Detected settings</div>
              <div className="text-sm space-y-1 capitalize">
                <div>Level: <b>{draft.role_level}</b></div>
                <div>Type: <b>{draft.employment_type?.replace(/_/g, " ")}</b></div>
                <div>Mode: <b>{draft.work_mode}</b></div>
                {draft.salary_note && <div className="normal-case">Salary: <b>{draft.salary_currency} {draft.salary_note}</b></div>}
              </div>
            </div>
          </div>

          {(draft.screening_questions ?? []).length > 0 && (
            <div className="rounded-lg bg-white border border-line p-4">
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={useQuestions} onChange={(e) => setUseQuestions(e.target.checked)} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-2">
                  Screening questions ({draft.screening_questions.length}) — add to the application form
                </span>
              </label>
              <ol className="space-y-2">
                {draft.screening_questions.map((q, i) => (
                  <li key={i} className="text-sm">
                    <b>{q.label}</b>
                    <span className="text-muted-2 text-xs"> · {q.type.replace(/_/g, " ")}{q.required ? " · required" : ""}</span>
                    {q.why && <div className="text-xs text-muted-2 italic mt-0.5">{q.why}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(draft.interview_focus ?? []).length > 0 && (
            <div className="rounded-lg bg-ink text-white p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-peach mb-2">Suggested interview focus</div>
              <ul className="space-y-1 text-sm text-white/80">
                {draft.interview_focus.map((f, i) => <li key={i}>· {f}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" className="btn-coral"
              onClick={() => { onApply(draft, { questions: useQuestions }); setOpen(false); }}>
              Apply to the form →
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setDraft(null); }}>
              Draft again
            </button>
          </div>
          <p className="text-xs text-muted-2">
            Applying fills the fields below — nothing is published. Review, edit anything, then save.
          </p>
        </div>
      )}
    </div>
  );
}
