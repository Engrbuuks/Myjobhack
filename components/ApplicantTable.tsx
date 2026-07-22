"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InterviewScheduler } from "@/components/InterviewScheduler";
import { ExportButton } from "@/components/ExportButton";
import { CandidateCard } from "@/components/CandidateCard";
import { PayButton } from "@/components/PayButton";

type Row = {
  id: string; talent_id?: string | null; status: string; rules_passed: boolean | null; card?: any; contact_locked?: boolean;
  ai_fit_score: number | null; ai_summary: string | null;
  created_at: string; name: string; email: string; guest?: boolean;
  answers: { label: string; value: string }[];
  resumeUrl: string | null;
};
const STATUSES = ["submitted", "shortlisted", "interviewing", "offered", "hired", "rejected"];

export function ApplicantTable({ rows, statusEndpoint, jobId }: { rows: Row[]; statusEndpoint?: string; jobId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [placeFor, setPlaceFor] = useState<Row | null>(null);
  const [salary, setSalary] = useState("");
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const [asmtNote, setAsmtNote] = useState<string | null>(null);
  async function orderAssessments() {
    if (picked.size === 0 || !jobId) return;
    setBulkBusy(true); setAsmtNote(null);
    const talent_ids = rows.filter((r) => picked.has(r.id)).map((r) => (r as any).talent_id).filter(Boolean);
    const res = await fetch("/api/employer/order-assessment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, talent_ids })
    });
    const j = await res.json();
    setBulkBusy(false);
    setAsmtNote(res.ok ? j.message : (j.error ?? "Could not order assessments."));
    if (res.ok) { setPicked(new Set()); setTimeout(() => router.refresh(), 2500); }
  }

  async function unlockContact(talentId: string) {
    await fetch("/api/employer/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ talent_id: talentId }) });
    router.refresh();
  }

  async function recordPlacement() {
    if (!placeFor) return;
    setPlacing(true); setPlaceNote(null);
    const res = await fetch("/api/employer/record-placement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talent_id: (placeFor as any).talent_id ?? placeFor.id, monthly_salary: Number(salary) || null })
    });
    const j = await res.json();
    setPlacing(false);
    if (res.ok) { setPlaceNote(j.message); setTimeout(() => { setPlaceFor(null); router.refresh(); }, 2500); }
    else setPlaceNote(j.error ?? "Could not record placement.");
  }

  function toggle(id: string) {
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  function toggleAll() { setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id))); }

  async function bulkStatus(status: string) {
    if (picked.size === 0) return;
    setBulkBusy(true);
    for (const id of Array.from(picked)) {
      if (statusEndpoint) {
        await fetch(statusEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      } else {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("applications").update({ status: status as any, reviewed_by: user!.id }).eq("id", id);
      }
    }
    setBulkBusy(false); setPicked(new Set()); router.refresh();
  }

  // Flatten rows for CSV export
  const exportRows = rows.map((r) => ({
    name: r.name, email: r.email, status: r.status,
    ai_fit: r.ai_fit_score ?? "", rules_passed: r.rules_passed == null ? "" : r.rules_passed ? "yes" : "no",
    applied: new Date(r.created_at).toLocaleDateString(),
    ...Object.fromEntries(r.answers.map((a) => [a.label, a.value]))
  }));

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
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-paper-2 border border-line">
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={allPicked} onChange={toggleAll} />
          Select all ({rows.length})
        </label>
        <span className="text-sm text-muted-2">{picked.size} selected</span>
        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-2">Move to:</span>
            {["shortlisted", "interviewing", "offered", "hired", "rejected"].map((s) => (
              <button key={s} disabled={bulkBusy} onClick={() => bulkStatus(s)}
                className="btn-ghost !h-8 text-xs capitalize">{s}</button>
            ))}
            {jobId && (
              <button disabled={bulkBusy} onClick={orderAssessments}
                className="btn-coral !h-8 text-xs" title="Order a job-specific assessment for the selected candidates">
                ✦ Order assessment
              </button>
            )}
          </div>
        )}
        {asmtNote && <span className="text-xs font-semibold text-coral">{asmtNote}</span>}
        <div className="flex-1" />
        <ExportButton rows={exportRows} filename="applicants" label="Export" />
      </div>
      {rows.map((r) => (
        <div key={r.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4 shrink-0" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
            <div className="flex-1 min-w-48">
              <div className="font-semibold text-sm">{r.name}</div>
              <div className="text-xs text-muted-2">{r.email} · {new Date(r.created_at).toLocaleDateString()}{r.guest && <span className="ml-2 px-1.5 py-0.5 rounded bg-paper-2 text-[10px] font-bold uppercase tracking-wider">Guest</span>}</div>
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
            {!r.guest ? <button className="text-sm font-semibold text-ink hover:text-coral transition"
              onClick={() => setScheduling(scheduling === r.id ? null : r.id)}>
              {scheduling === r.id ? "Close" : "🗓 Interview"}
            </button> : <a href={`mailto:${r.email}`} className="btn-ghost !h-9 text-xs">📧 Email</a>}
            {r.status === "hired" && (
              <button className="btn-coral !h-9 text-xs" onClick={() => { setPlaceFor(r); setSalary(""); setPlaceNote(null); }}>
                Record placement
              </button>
            )}
            <button className="text-coral text-sm font-semibold" onClick={() => setOpen(open === r.id ? null : r.id)}>
              {open === r.id ? "Close" : "Details"}
            </button>
          </div>
          {scheduling === r.id && (
            <div className="mt-4 pt-4 border-t border-line">
              <InterviewScheduler applicationId={r.id} onDone={() => setScheduling(null)} />
            </div>
          )}
          {open === r.id && r.card && (
            <div className="mt-4 pt-4 border-t border-line">
              <CandidateCard card={r.card} onUnlock={unlockContact} />
            </div>
          )}
          {open === r.id && !r.card && (
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
      {placeFor && (
        <div className="fixed inset-0 bg-ink/50 grid place-items-center z-50 p-4" onClick={() => !placing && setPlaceFor(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-display font-semibold text-lg">Record placement</h3>
              <p className="text-sm text-muted-2">{placeFor.name}</p>
            </div>
            <p className="text-sm text-muted-2">
              If this candidate is an Elite member, the fee is a percentage of their monthly salary — enter it below.
              Otherwise a flat placement fee applies and you can leave salary blank.
            </p>
            <div>
              <label className="label">Monthly salary (₦) — for Elite fee</label>
              <input className="input" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 400000" />
            </div>
            {placeNote && <p className="text-sm font-semibold text-green-600">{placeNote}</p>}
            {placeNote && (placeFor as any).talent_id && (
              <p className="text-xs text-muted-2">An invoice was raised. The employer can pay it online from Invoices, or via Paystack when prompted.</p>
            )}
            <div className="flex gap-3">
              <button className="btn-coral" onClick={recordPlacement} disabled={placing}>
                {placing ? "Recording…" : "Record & raise fee"}
              </button>
              <button className="btn-ghost" onClick={() => setPlaceFor(null)} disabled={placing}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
