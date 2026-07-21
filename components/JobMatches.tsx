"use client";
import { useState } from "react";

type Match = { talent_id: string; name: string; score: number; reasons: string[]; competency_fit: boolean };

const BAND = (fit: boolean) => fit
  ? "bg-green-100 text-green-700"
  : "bg-paper-2 text-muted-2";

export function JobMatches({ jobId }: { jobId: string }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const [matches, setMatches] = useState<Match[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);
  const [orderNote, setOrderNote] = useState<string | null>(null);

  function togglePick(id: string) {
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function orderAssessments() {
    if (picked.size === 0) return;
    setOrdering(true); setOrderNote(null);
    const res = await fetch("/api/employer/order-assessment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, talent_ids: Array.from(picked) })
    });
    const json = await res.json();
    setOrdering(false);
    if (res.ok) { setOrderNote(json.message); setPicked(new Set()); }
    else setOrderNote(json.error ?? "Could not create order.");
  }

  async function find() {
    setPhase("loading"); setErr(null);
    const res = await fetch("/api/match/job", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_id: jobId })
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Could not find matches."); setPhase("idle"); return; }
    setMatches(json.matches ?? []); setPhase("ready");
  }

  async function unlock(talentId: string) {
    const res = await fetch("/api/employer/unlock", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ talent_id: talentId })
    });
    const json = await res.json();
    if (res.ok) { setUnlocked((s) => new Set(s).add(talentId)); }
    else if (json.upgrade) { setUpgrade(true); setErr(json.error); }
    else setErr(json.error ?? "Could not unlock.");
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display font-semibold text-lg">Matched candidates</h3>
        {phase === "ready" && <button className="text-sm text-coral font-semibold" onClick={find}>Refresh</button>}
      </div>
      <p className="text-sm text-muted-2 mb-4">Ranked by proven competency and fit — not just keywords.</p>

      {phase === "idle" && (
        <button className="btn-coral" onClick={find}>Find matches →</button>
      )}
      {phase === "loading" && <div className="animate-pulse text-sm text-muted-2 py-4">Scoring the pool against this role…</div>}

      {phase === "ready" && (
        <div className="space-y-2">
          {matches.length === 0 && <p className="text-sm text-muted-2">No strong matches yet — as more candidates get assessed, this fills in.</p>}
          {matches.map((m) => {
            const isUnlocked = unlocked.has(m.talent_id);
            return (
              <div key={m.talent_id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {isUnlocked ? m.name : "Candidate"}
                    {m.competency_fit && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${BAND(true)}`}>competency fit</span>}
                  </div>
                  <div className="text-xs text-muted-2 truncate">{m.reasons?.[0] ?? "Profile match"}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-muted-2 cursor-pointer">
                    <input type="checkbox" className="accent-[#FC5647]" checked={picked.has(m.talent_id)} onChange={() => togglePick(m.talent_id)} />
                    assess
                  </label>
                  <span className="text-sm font-bold text-coral">{m.score}%</span>
                  {isUnlocked ? (
                    <a href={`/portal/admin/pool/${m.talent_id}`} className="btn-ghost !h-8 text-xs">View</a>
                  ) : (
                    <button className="btn-coral !h-8 text-xs" onClick={() => unlock(m.talent_id)}>Unlock</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {phase === "ready" && picked.size > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-paper-2 border border-line flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{picked.size} selected · ₦{(picked.size * 3500).toLocaleString()} to assess for this role</span>
          <button className="btn-coral !h-9 text-sm" disabled={ordering} onClick={orderAssessments}>
            {ordering ? "Ordering…" : "Order role assessments"}
          </button>
        </div>
      )}
      {orderNote && <p className="text-sm text-green-600 font-semibold mt-3">{orderNote}</p>}
      {err && <p className="text-coral text-sm mt-3">{err}</p>}
      {upgrade && <a href="/portal/employer/upgrade" className="btn-coral !h-9 text-sm mt-3 inline-flex">See plans →</a>}
    </div>
  );
}
