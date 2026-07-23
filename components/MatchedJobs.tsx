"use client";
import { useState, useEffect } from "react";

export function MatchedJobs() {
  const [state, setState] = useState<"loading" | "ready" | "empty" | "needs_assessment">("loading");
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/match/for-me").then((r) => r.json()).then((j) => {
      const m = j.matches ?? [];
      setMatches(m);
      setState(j.needs_assessment ? "needs_assessment" : m.length ? "ready" : "empty");
    }).catch(() => setState("empty"));
  }, []);

  if (state === "loading") return <div className="card p-6 animate-pulse text-sm text-muted-2">Finding roles matched to your competency…</div>;

  // The assessment is what unlocks matching — say so plainly rather than
  // showing an empty panel with no explanation.
  if (state === "needs_assessment") return (
    <div className="card p-6 border-coral/40" style={{ background: "#FFF4F2" }}>
      <h3 className="font-display font-semibold text-lg mb-1">Matching starts with your assessment</h3>
      <p className="text-sm text-muted-2 mb-4">
        Employers rank candidates by proven competency, not keywords. Take your assessment and we'll
        start matching you to roles — and email you when a strong one appears.
      </p>
      <a href="/portal/seeker/assessment" className="btn-coral !h-10 text-sm">Prove my competency →</a>
    </div>
  );

  if (state === "empty") return null;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-lg">Matched to you</h3>
        <span className="text-xs text-muted-2">Ranked by fit to your assessed competency</span>
      </div>
      <div className="space-y-3">
        {matches.map((m) => (
          <a key={m.job.id} href={`/jobs/${m.job.id}`} className="block p-4 rounded-xl border border-line hover:border-coral transition">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{m.job.title}</div>
                <div className="text-xs text-muted-2 truncate">{m.job.company_name || "MYJOBHACK"} · {m.reasons?.[0]}</div>
              </div>
              <span className="shrink-0 text-sm font-bold text-coral">{m.score}%</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
