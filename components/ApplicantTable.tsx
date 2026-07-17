"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InterviewScheduler } from "@/components/InterviewScheduler";

type Row = {
  id: string; status: string; rules_passed: boolean | null;
  ai_fit_score: number | null; ai_summary: string | null;
  created_at: string; name: string; email: string;
  answers: { label: string; value: string }[];
  resumeUrl: string | null;
};
const STATUSES = ["submitted", "shortlisted", "interviewing", "offered", "hired", "rejected"];

export function ApplicantTable({ rows, statusEndpoint }: { rows: Row[]; statusEndpoint?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    if (statusEndpoint) {
      await fetch(statusEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
    } else {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("applications").update({ status: status as any, reviewed_by: user!.id }).eq("id", id);
    }
    setBusy(null); router.refresh();
  }

  if (rows.length === 0)
    return <div className="card p-10 text-center text-sm text-muted">No applications yet.</div>;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-48">
              <div className="font-semibold text-sm">{r.name}</div>
              <div className="text-xs text-muted-2">{r.email} · {new Date(r.created_at).toLocaleDateString()}</div>
            </div>
            {r.ai_fit_score != null && (
              <div className="text-center">
                <div className={`font-display font-semibold text-2xl ${r.ai_fit_score >= 70 ? "text-ink" : r.ai_fit_score >= 45 ? "" : "text-muted-2"}`}>
                  {Math.round(r.ai_fit_score)}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted">AI fit</div>
              </div>
            )}
            {r.rules_passed != null && (
              <span className={`px-2.5 py-1 rounded-pill text-xs font-bold ${
                r.rules_passed ? "bg-ink text-white" : "bg-paper-2 text-muted"}`}>
                {r.rules_passed ? "Rules ✓" : "Rules ✗"}
              </span>
            )}
            <select className="input !h-10 !w-auto text-sm capitalize" value={r.status}
              disabled={busy === r.id}
              onChange={(e) => setStatus(r.id, e.target.value)}>
              {STATUSES.concat(r.status === "rules_failed" ? ["rules_failed"] : []).map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            <button className="text-sm font-semibold text-ink hover:text-coral transition"
              onClick={() => setScheduling(scheduling === r.id ? null : r.id)}>
              {scheduling === r.id ? "Close" : "🗓 Interview"}
            </button>
            <button className="text-coral text-sm font-semibold" onClick={() => setOpen(open === r.id ? null : r.id)}>
              {open === r.id ? "Close" : "Details"}
            </button>
          </div>
          {scheduling === r.id && (
            <div className="mt-4 pt-4 border-t border-line">
              <InterviewScheduler applicationId={r.id} onDone={() => setScheduling(null)} />
            </div>
          )}
          {open === r.id && (
            <div className="mt-4 pt-4 border-t border-line grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Answers</div>
                {r.answers.length === 0 ? <p className="text-muted-2">No custom questions.</p> :
                  r.answers.map((a, i) => (
                    <div key={i} className="mb-2">
                      <span className="text-muted">{a.label}: </span>
                      <span className="font-medium">{a.value}</span>
                    </div>
                  ))}
                {r.resumeUrl && (
                  <a href={r.resumeUrl} target="_blank" rel="noopener" className="text-coral font-semibold">Open resume →</a>
                )}
              </div>
              {r.ai_summary && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">AI assessment</div>
                  <p className="leading-relaxed">{r.ai_summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
