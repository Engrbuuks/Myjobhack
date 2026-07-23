"use client";

type Answer = { field_id?: string; label: string; value: string; raw?: any };
type Row = {
  status: string;
  ai_fit_score: number | null;
  rules_passed: boolean | null;
  created_at: string;
  card?: { competency_band?: string | null } | null;
  answers?: Answer[];
};
type FormField = { id: string; label: string; type: string };

const STAGE_ORDER = ["submitted", "shortlisted", "interviewing", "offered", "hired", "rejected"];
const STAGE_LABEL: Record<string, string> = {
  submitted: "Applied", shortlisted: "Shortlisted", interviewing: "Interviewing",
  offered: "Offered", hired: "Hired", rejected: "Rejected", rules_failed: "Filtered out",
  withdrawn: "Withdrawn"
};

export function ApplicantCharts({ rows, openings, formFields = [] }:
  { rows: Row[]; openings?: number; formFields?: FormField[] }) {
  if (!rows.length) return null;

  /* ---- pipeline funnel ---- */
  const byStage = new Map<string, number>();
  rows.forEach(r => byStage.set(r.status, (byStage.get(r.status) ?? 0) + 1));
  const pipeline = STAGE_ORDER
    .filter(s => byStage.has(s))
    .map(s => ({ stage: s, label: STAGE_LABEL[s] ?? s, count: byStage.get(s)! }));
  const other = Array.from(byStage.entries())
    .filter(([s]) => !STAGE_ORDER.includes(s))
    .map(([s, c]) => ({ stage: s, label: STAGE_LABEL[s] ?? s, count: c }));
  const maxStage = Math.max(1, ...pipeline.map(p => p.count), ...other.map(o => o.count));

  /* ---- competency band mix ---- */
  const bands = new Map<string, number>();
  rows.forEach(r => {
    const b = r.card?.competency_band ?? "Not assessed";
    bands.set(b, (bands.get(b) ?? 0) + 1);
  });
  const bandRows = Array.from(bands.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([band, count]) => ({ band, count, pct: Math.round((count / rows.length) * 100) }));

  /* ---- fit score distribution ---- */
  const buckets = [
    { label: "80–100", min: 80, max: 101 },
    { label: "65–79", min: 65, max: 80 },
    { label: "50–64", min: 50, max: 65 },
    { label: "Below 50", min: 0, max: 50 }
  ].map(b => ({
    ...b,
    count: rows.filter(r => r.ai_fit_score != null && r.ai_fit_score >= b.min && r.ai_fit_score < b.max).length
  }));
  const scored = rows.filter(r => r.ai_fit_score != null).length;
  const maxBucket = Math.max(1, ...buckets.map(b => b.count));

  /* ---- headline numbers ---- */
  const hired = byStage.get("hired") ?? 0;
  const passed = rows.filter(r => r.rules_passed !== false).length;
  const avgFit = scored
    ? Math.round(rows.reduce((t, r) => t + (r.ai_fit_score ?? 0), 0) / scored)
    : null;

  // Applications in the last 7 days — is this posting still pulling?
  const weekAgo = Date.now() - 7 * 864e5;
  const recent = rows.filter(r => new Date(r.created_at).getTime() >= weekAgo).length;

  /* ---- screening answers ----
     Only fixed-choice fields (select, multiselect, boolean) are worth counting:
     free text produces one unique answer per person, which tells you nothing in
     aggregate. Numeric fields get a min/median/max summary instead. */
  const COUNTABLE = new Set(["select", "multiselect", "boolean"]);
  const answerCharts = formFields
    .filter(f => COUNTABLE.has(f.type))
    .map(f => {
      const tally = new Map<string, number>();
      rows.forEach(r => {
        const a = r.answers?.find(x => x.field_id === f.id);
        if (!a || a.value === "" || a.value == null) return;
        // multiselect stores several values in one answer
        const parts = f.type === "multiselect"
          ? String(a.value).split(",").map(v => v.trim()).filter(Boolean)
          : [String(a.value).trim()];
        parts.forEach(v => {
          const key = f.type === "boolean"
            ? (v === "true" || v === "Yes" || v === "yes" ? "Yes" : "No")
            : v;
          tally.set(key, (tally.get(key) ?? 0) + 1);
        });
      });
      const answered = rows.filter(r =>
        r.answers?.some(x => x.field_id === f.id && x.value !== "" && x.value != null)).length;
      return {
        label: f.label, type: f.type, answered,
        options: Array.from(tally.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([option, count]) => ({
            option, count,
            pct: answered ? Math.round((count / answered) * 100) : 0
          }))
      };
    })
    .filter(c => c.options.length > 0);

  // Numeric answers — a distribution is more useful than a count.
  const numericSummaries = formFields
    .filter(f => f.type === "number")
    .map(f => {
      const nums = rows
        .map(r => r.answers?.find(x => x.field_id === f.id)?.value)
        .map(v => Number(v))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (!nums.length) return null;
      const median = nums.length % 2
        ? nums[(nums.length - 1) / 2]
        : Math.round((nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2);
      return { label: f.label, min: nums[0], median, max: nums[nums.length - 1], answered: nums.length };
    })
    .filter(Boolean) as { label: string; min: number; median: number; max: number; answered: number }[];

  return (
    <div className="space-y-4 mb-6">
      {/* headline */}
      <div className="grid sm:grid-cols-4 gap-4">
        {[
          ["Applicants", String(rows.length), `${recent} in the last 7 days`],
          ["Passed screening", String(passed), `${rows.length - passed} filtered out`],
          ["Average fit", avgFit != null ? `${avgFit}%` : "—", scored ? `${scored} scored` : "not scored yet"],
          ["Hired", openings && openings > 1 ? `${hired}/${openings}` : String(hired), openings && openings > 1 ? "of target" : "so far"]
        ].map(([label, value, hint]) => (
          <div key={label} className="card p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">{label}</div>
            <div className="font-display font-semibold text-2xl">{value}</div>
            <div className="text-xs text-muted-2 mt-1">{hint}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* pipeline */}
        <div className="card p-5 lg:col-span-2">
          <div className="font-display font-semibold mb-1">Where applicants stand</div>
          <p className="text-xs text-muted-2 mb-3">Movement through the pipeline for this role.</p>
          <div className="space-y-2.5">
            {[...pipeline, ...other].map(p => (
              <div key={p.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-muted-2">{p.count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-paper-2 overflow-hidden">
                  <div className={`h-full rounded-full ${
                      p.stage === "hired" ? "bg-ink"
                      : p.stage === "rejected" || p.stage === "rules_failed" ? "bg-muted-2"
                      : "bg-coral"}`}
                    style={{ width: `${Math.round((p.count / maxStage) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* competency mix */}
        <div className="card p-5">
          <div className="font-display font-semibold mb-1">Competency mix</div>
          <p className="text-xs text-muted-2 mb-3">Who is actually applying.</p>
          <div className="space-y-2.5">
            {bandRows.map(b => (
              <div key={b.band}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium capitalize truncate">{b.band}</span>
                  <span className="text-muted-2 shrink-0 ml-2">{b.count} · {b.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-paper-2 overflow-hidden">
                  <div className={`h-full rounded-full ${b.band === "Not assessed" ? "bg-muted-2" : "bg-coral"}`}
                    style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* fit distribution */}
      {scored > 0 && (
        <div className="card p-5">
          <div className="font-display font-semibold mb-1">Fit score distribution</div>
          <p className="text-xs text-muted-2 mb-3">
            How well this pool matches the role. A cluster below 50 usually means the job spec needs tightening.
          </p>
          <div className="flex items-end gap-3 h-28">
            {buckets.map(b => (
              <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-xs font-semibold mb-1">{b.count}</span>
                <div className="w-full rounded-t-lg bg-coral"
                  style={{ height: `${Math.max(4, Math.round((b.count / maxBucket) * 100))}%` }} />
                <span className="text-[10px] text-muted-2 mt-1.5 whitespace-nowrap">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* screening answers — the richest data on the page, previously invisible in aggregate */}
      {(answerCharts.length > 0 || numericSummaries.length > 0) && (
        <div className="card p-5">
          <div className="font-display font-semibold mb-1">Screening answers</div>
          <p className="text-xs text-muted-2 mb-4">
            How this pool answered your questions. Free-text answers aren't counted — only fixed-choice
            and numeric questions produce a meaningful breakdown.
          </p>

          <div className="grid lg:grid-cols-2 gap-x-8 gap-y-5">
            {answerCharts.map((c) => (
              <div key={c.label}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-semibold text-sm">{c.label}</span>
                  <span className="text-[10px] text-muted-2 whitespace-nowrap ml-2">
                    {c.answered} answered
                  </span>
                </div>
                <div className="space-y-1.5">
                  {c.options.slice(0, 6).map((o) => (
                    <div key={o.option}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="truncate pr-2">{o.option}</span>
                        <span className="text-muted-2 shrink-0">{o.count} · {o.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden">
                        <div className="h-full bg-coral rounded-full" style={{ width: `${o.pct}%` }} />
                      </div>
                    </div>
                  ))}
                  {c.options.length > 6 && (
                    <p className="text-[10px] text-muted-2 pt-0.5">
                      +{c.options.length - 6} more option{c.options.length - 6 === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {numericSummaries.map((n) => (
              <div key={n.label}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-semibold text-sm">{n.label}</span>
                  <span className="text-[10px] text-muted-2 whitespace-nowrap ml-2">{n.answered} answered</span>
                </div>
                <div className="flex items-end gap-4">
                  {[["Lowest", n.min], ["Median", n.median], ["Highest", n.max]].map(([l, v]) => (
                    <div key={String(l)}>
                      <div className={`font-display font-semibold text-lg ${l === "Median" ? "text-coral" : ""}`}>{v}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-2">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
