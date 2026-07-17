"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Competency = { name: string; rating: number; note?: string };
export type InterviewRow = {
  id: string; status: string; outcome: string; round: number;
  mode: string; scheduled_at: string | null; duration_min: number | null;
  location_or_link: string; calendly_url: string;
  scorecard: Competency[]; feedback: string;
  name: string; email: string; jobTitle: string; applicantHref?: string;
};

const DEFAULT_COMPETENCIES = ["Communication", "Technical depth", "Problem solving", "Role knowledge", "Values fit"];

export function InterviewDesk({ rows }: { rows: InterviewRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(id: string, body: Record<string, any>) {
    setBusy(id); setErr(null);
    const res = await fetch("/api/interviews", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return false; }
    router.refresh(); return true;
  }

  if (rows.length === 0)
    return <div className="card p-10 text-center text-sm text-muted">No interviews here yet — invite candidates from any applicant list.</div>;

  return (
    <div className="space-y-3">
      {err && <p className="text-coral text-sm">{err}</p>}
      {rows.map((r) => (
        <div key={r.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-52">
              <div className="font-semibold text-sm">{r.name}
                <span className="text-muted-2 font-normal"> · {r.jobTitle}</span></div>
              <div className="text-xs text-muted-2 mt-0.5">
                Round {r.round} · {r.mode.replace(/_/g, " ")} ·{" "}
                {r.scheduled_at
                  ? new Date(r.scheduled_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                  : r.calendly_url ? "awaiting candidate's slot pick" : "time TBA"}
                {r.duration_min ? ` · ${r.duration_min}m` : ""}
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
              r.status === "scheduled" ? "bg-ink text-white" :
              r.status === "completed" ? "bg-paper-2 text-muted" :
              r.status === "invited" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted line-through"}`}>
              {r.status.replace(/_/g, " ")}
            </span>
            {r.outcome !== "pending" && (
              <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
                r.outcome === "advanced" ? "bg-coral text-white" : "bg-paper-2 text-muted"}`}>
                {r.outcome}
              </span>
            )}
            {r.status === "invited" && (
              <button className="btn-ghost !h-9 text-xs" disabled={busy === r.id}
                onClick={() => call(r.id, { action: "mark_scheduled" })}>Mark scheduled</button>
            )}
            {["invited", "scheduled"].includes(r.status) && (
              <>
                <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy === r.id}
                  onClick={() => call(r.id, { action: "no_show" })}>No-show</button>
                <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy === r.id}
                  onClick={() => call(r.id, { action: "cancel" })}>Cancel</button>
              </>
            )}
            <button className="text-coral text-sm font-semibold" onClick={() => setOpen(open === r.id ? null : r.id)}>
              {open === r.id ? "Close" : "Review →"}
            </button>
          </div>

          {open === r.id && (
            <Review r={r} busy={busy === r.id}
              onSave={(scorecard, feedback) => call(r.id, { action: "save_review", scorecard, feedback })}
              onOutcome={(outcome) => call(r.id, { action: "outcome", outcome })} />
          )}
        </div>
      ))}
    </div>
  );
}

function Review({ r, busy, onSave, onOutcome }: {
  r: InterviewRow; busy: boolean;
  onSave: (s: Competency[], f: string) => Promise<boolean>;
  onOutcome: (o: string) => Promise<boolean>;
}) {
  const seed: Competency[] = r.scorecard?.length
    ? r.scorecard
    : DEFAULT_COMPETENCIES.map((name) => ({ name, rating: 0 }));
  const [scores, setScores] = useState<Competency[]>(seed);
  const [feedback, setFeedback] = useState(r.feedback ?? "");
  const [custom, setCustom] = useState("");
  const [saved, setSaved] = useState(false);

  const setRating = (i: number, rating: number) =>
    setScores((s) => s.map((x, idx) => (idx === i ? { ...x, rating } : x)));

  const avg = (() => {
    const rated = scores.filter((s) => s.rating > 0);
    return rated.length ? (rated.reduce((a, s) => a + s.rating, 0) / rated.length).toFixed(1) : null;
  })();

  return (
    <div className="mt-4 pt-4 border-t border-line grid lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">Competency scorecard</div>
          {avg && <span className="font-display font-semibold text-lg">{avg}<span className="text-muted-2 text-sm">/5</span></span>}
        </div>
        <div className="space-y-2.5">
          {scores.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm flex-1">{s.name}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button"
                    className={`w-8 h-8 rounded-full border text-xs font-bold transition ${
                      s.rating >= n ? "bg-coral border-coral text-white" : "border-line text-muted hover:border-coral"}`}
                    onClick={() => setRating(i, s.rating === n ? 0 : n)}>{n}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input className="input !h-9 flex-1 text-sm" placeholder="Add competency…"
            value={custom} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                setScores((s) => [...s, { name: custom.trim(), rating: 0 }]); setCustom("");
              }
            }} />
          <button className="btn-ghost !h-9 text-xs" onClick={() => {
            if (custom.trim()) { setScores((s) => [...s, { name: custom.trim(), rating: 0 }]); setCustom(""); }
          }}>＋</button>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Notes & verdict</div>
        <textarea className="input !h-auto py-2.5 mb-3" rows={5}
          placeholder="Strengths, concerns, next-round focus…"
          value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn-ghost !h-10 w-full justify-center mb-3" disabled={busy}
          onClick={async () => { const ok = await onSave(scores, feedback); if (ok) setSaved(true); }}>
          {saved ? "Saved ✓" : "Save review"}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-coral !h-10 !px-2 justify-center text-xs" disabled={busy}
            onClick={() => onOutcome("advanced")}>Advance ✓</button>
          <button className="inline-flex items-center justify-center h-10 rounded-pill border border-line text-xs font-bold hover:border-coral transition" disabled={busy}
            onClick={() => onOutcome("hold")}>Hold</button>
          <button className="inline-flex items-center justify-center h-10 rounded-pill border border-line text-xs font-bold text-muted hover:border-coral hover:text-coral transition" disabled={busy}
            onClick={() => onOutcome("rejected")}>Reject</button>
        </div>
        <p className="text-[11px] text-muted-2 mt-2 leading-relaxed">
          Advance → application becomes <b>offered</b>. Reject → <b>rejected</b>. Hold keeps it at interviewing. The candidate is notified either way.
        </p>
      </div>
    </div>
  );
}
