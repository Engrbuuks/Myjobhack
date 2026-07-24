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
  const [sortBy, setSortBy] = useState<"fit" | "newest" | "oldest" | "name" | "band" | "stage">("fit");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterBand, setFilterBand] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [placeFor, setPlaceFor] = useState<Row | null>(null);
  const [salary, setSalary] = useState("");
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const [asmtNote, setAsmtNote] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);

  // How many applicants have never been scored? Guest applications were not
  // scored historically, so a job can show a whole page of blanks.
  const unscored = rows.filter((r) => r.ai_fit_score == null).length;

  async function scoreUnscored() {
    if (!jobId) return;
    setScoring(true); setAsmtNote(null);
    const res = await fetch("/api/admin/score-applicants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, limit: 40 })
    });
    const j = await res.json();
    setScoring(false);
    setAsmtNote(res.ok ? j.message : (j.error ?? "Could not score applicants."));
    if (res.ok) setTimeout(() => router.refresh(), 1500);
  }
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
  // Sorting and filtering. Applied before anything is rendered, so bulk actions
  // and export operate on exactly what the employer is looking at.
  const BAND_RANK: Record<string, number> = { expert: 4, strong: 3, proficient: 2, developing: 1 };
  const STAGE_RANK: Record<string, number> = {
    hired: 6, offered: 5, interviewing: 4, shortlisted: 3, submitted: 2, rules_failed: 1, rejected: 0, withdrawn: 0
  };

  const visible = rows
    .filter((r) => filterStage === "all" || r.status === filterStage)
    .filter((r) => {
      if (filterBand === "all") return true;
      const b = (r as any).card?.competency_band ?? null;
      return filterBand === "none" ? !b : b === filterBand;
    })
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return r.name.toLowerCase().includes(q)
        || r.answers.some((a) => String(a.value).toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => {
      switch (sortBy) {
        case "newest": return +new Date(b.created_at) - +new Date(a.created_at);
        case "oldest": return +new Date(a.created_at) - +new Date(b.created_at);
        case "name":   return a.name.localeCompare(b.name);
        case "stage":  return (STAGE_RANK[b.status] ?? 0) - (STAGE_RANK[a.status] ?? 0);
        case "band": {
          const ab = BAND_RANK[((a as any).card?.competency_band ?? "").toLowerCase()] ?? 0;
          const bb = BAND_RANK[((b as any).card?.competency_band ?? "").toLowerCase()] ?? 0;
          return bb - ab;
        }
        default: return (b.ai_fit_score ?? -1) - (a.ai_fit_score ?? -1);
      }
    });

  // Which bands actually appear, so we don't offer empty filters.
  const availableBands = Array.from(new Set(
    rows.map((r) => (r as any).card?.competency_band).filter(Boolean)
  )) as string[];
  const availableStages = Array.from(new Set(rows.map((r) => r.status)));

  const allPicked = visible.length > 0 && visible.every((r) => picked.has(r.id));
  function toggleAll() { setPicked(allPicked ? new Set() : new Set(visible.map((r) => r.id))); }

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
  const exportRows = visible.map((r) => ({
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
      {/* Sort and filter — operates on what you see, so bulk actions and export
          apply to exactly the set on screen. */}
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl bg-white border border-line">
        <div>
          <label className="label !text-xs">Sort by</label>
          <select className="input !h-9 !w-auto text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="fit">Best fit first</option>
            <option value="band">Competency band</option>
            <option value="stage">Furthest in pipeline</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
        <div>
          <label className="label !text-xs">Stage</label>
          <select className="input !h-9 !w-auto text-xs capitalize" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
            <option value="all">All stages</option>
            {availableStages.map((st) => <option key={st} value={st}>{st.replace("_", " ")}</option>)}
          </select>
        </div>
        {availableBands.length > 0 && (
          <div>
            <label className="label !text-xs">Competency</label>
            <select className="input !h-9 !w-auto text-xs capitalize" value={filterBand} onChange={(e) => setFilterBand(e.target.value)}>
              <option value="all">Any band</option>
              {availableBands.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="none">Not assessed</option>
            </select>
          </div>
        )}
        <div className="flex-1 min-w-40">
          <label className="label !text-xs">Search</label>
          <input className="input !h-9 text-xs" placeholder="Name or answer text…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {(filterStage !== "all" || filterBand !== "all" || query) && (
          <button className="btn-ghost !h-9 text-xs"
            onClick={() => { setFilterStage("all"); setFilterBand("all"); setQuery(""); }}>
            Clear
          </button>
        )}
        <span className="text-xs text-muted-2 whitespace-nowrap pb-2">
          {visible.length} of {rows.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-paper-2 border border-line">
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={allPicked} onChange={toggleAll} />
          Select all ({visible.length})
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
        {jobId && unscored > 0 && (
          <button className="btn-ghost !h-8 text-xs" onClick={scoreUnscored} disabled={scoring}
            title="Rank these applicants by how well their CV matches the job description">
            {scoring ? "Scoring…" : `✦ Score ${unscored} unranked`}
          </button>
        )}
        {asmtNote && <span className="text-xs font-semibold text-coral">{asmtNote}</span>}
        <div className="flex-1" />
        <ExportButton rows={exportRows} filename="applicants" label="Export" />
      </div>
      {visible.map((r) => (
        <div key={r.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4 shrink-0" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
            <div className="flex-1 min-w-48">
              <div className="font-semibold text-sm">{r.name}</div>
              <div className="text-xs text-muted-2">{r.email} · {new Date(r.created_at).toLocaleDateString()}{r.guest && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-paper-2 text-[10px] font-bold uppercase tracking-wider"
                    title="Applied without an account, so they have no competency band. Judge this one on the CV alone.">
                    Guest · not assessed
                  </span>
                )}</div>
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
