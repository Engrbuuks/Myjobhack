"use client";
import { useState } from "react";

export function AssessmentReview({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [overall, setOverall] = useState(String(row.overall));
  const [band, setBand] = useState(row.band);
  const [note, setNote] = useState("");

  const [outcome, setOutcome] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Publishing a band emails the candidate, and whether that email left is
   * part of the outcome, not a detail.
   *
   * This checked res.ok and showed a tick. A candidate who sat a thirty five
   * minute assessment and was told to watch for their badge is relying on that
   * message, so a failed send has to be visible to the reviewer who can do
   * something about it.
   */
  async function act(action: "confirm" | "override") {
    setBusy(true); setErr(null);
    const res = await fetch("/api/admin/review-assessment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score_id: row.id, action, override_overall: Number(overall), override_band: band, note })
    });
    const json = await res.json().catch(() => ({} as any));
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "That review could not be saved."); return; }
    setOutcome(json.message ?? null);
    setDone(true);
  }

  if (done) return (
    <div className="card p-4 text-sm">
      <span className="text-green-600 font-semibold">✓ Reviewed — {row.name}</span>
      {outcome && <span className="text-muted-2"> · {outcome}</span>}
    </div>
  );

  return (
    <div className="card p-5">
      {err && <p className="text-coral text-sm mb-3">{err}</p>}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{row.name} <span className="text-muted-2 font-normal">· {row.field}</span></div>
          <div className="text-sm text-muted-2 mt-0.5">
            AI: {row.overall}/100 · <span className="capitalize">{row.band}</span> · confidence {(row.ai_confidence * 100).toFixed(0)}%
          </div>
          {row.flags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.flags.map((f: string, i: number) => <span key={i} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-pill font-semibold">⚑ {f}</span>)}
            </div>
          )}
        </div>
        <button className="btn-ghost !h-9 text-sm" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Review"} answers</button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {row.questions.map((q: any, i: number) => {
            const ans = row.answers.find((a: any) => a.question_id === q.id);
            const grade = row.per_question?.find((p: any) => p.question_id === q.id);
            return (
              <div key={q.id} className="text-sm">
                <div className="font-medium">{i + 1}. {q.prompt}</div>
                <div className="text-muted-2 mt-1 whitespace-pre-wrap bg-paper-2 rounded-lg p-3">{ans?.answer || "— no answer —"}</div>
                {grade && <div className="text-xs text-muted-2 mt-1">AI: {grade.points}/{grade.max} — {grade.note}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <div><label className="label !text-xs">Score</label>
          <input className="input !h-9 w-20" type="number" value={overall} onChange={(e) => setOverall(e.target.value)} /></div>
        <div><label className="label !text-xs">Band</label>
          <select className="input !h-9" value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="developing">Developing</option><option value="proficient">Proficient</option>
            <option value="strong">Strong</option><option value="expert">Expert</option>
          </select></div>
        <input className="input !h-9 flex-1 min-w-[140px]" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-ghost !h-9 text-sm" disabled={busy} onClick={() => act("override")}>Override</button>
        <button className="btn-coral !h-9 text-sm" disabled={busy} onClick={() => act("confirm")}>Confirm AI</button>
      </div>
    </div>
  );
}
