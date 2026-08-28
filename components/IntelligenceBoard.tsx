"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ExportButton } from "@/components/ExportButton";
import type { Intelligence } from "@/lib/poolIntelligence";

const fmt = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString()}`;

export function IntelligenceBoard({ data }: { data: Intelligence }) {
  const router = useRouter();
  const params = useSearchParams();
  const [fee, setFee] = useState(String(data.assumptions.training_fee));
  const [placement, setPlacement] = useState(String(data.assumptions.placement_fee));
  const [take, setTake] = useState(String(Math.round(data.assumptions.take_rate * 100)));
  const cur = data.assumptions.currency;

  function apply() {
    const q = new URLSearchParams(params.toString());
    q.set("fee", fee); q.set("placement", placement); q.set("take", take);
    router.push(`/portal/admin/intelligence?${q.toString()}`);
  }

  const collectable = data.revenue.filter((r) => r.kind === "collectable");
  const leaks = data.revenue.filter((r) => r.kind === "leak");
  const pipeline = data.revenue.filter((r) => r.kind === "pipeline" || r.kind === "growth");

  return (
    <div className="space-y-6">
      {/* The one sentence worth reading */}
      <div className="card p-6" style={{ background: "#FFF4F2" }}>
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Where things stand</div>
        <p className="font-display text-xl leading-snug text-ink">{data.headline}</p>
      </div>

      {/* Assumptions — visible, editable, never silently baked in */}
      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">
          Your numbers — every projection below uses these
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label !text-xs">Training fee per learner</label>
            <input className="input !h-10 !w-36 text-sm" type="number" value={fee}
              onChange={(e) => setFee(e.target.value)} />
          </div>
          <div>
            <label className="label !text-xs">Placement fee per hire</label>
            <input className="input !h-10 !w-36 text-sm" type="number" value={placement}
              onChange={(e) => setPlacement(e.target.value)} />
          </div>
          <div>
            <label className="label !text-xs">Take rate %</label>
            <input className="input !h-10 !w-24 text-sm" type="number" value={take}
              onChange={(e) => setTake(e.target.value)} />
          </div>
          <button className="btn-coral !h-10 text-sm" onClick={apply}>Recalculate</button>
          <p className="text-xs text-muted-2 flex-1 min-w-48">
            Projections are arithmetic on your assumptions, not forecasts. Counts and rates
            elsewhere on this page are measured.
          </p>
        </div>
      </div>

      {/* Money */}
      <section>
        <h2 className="font-display font-semibold text-xl mb-1">Revenue</h2>
        <p className="text-sm text-muted-2 mb-4">Ordered by how quickly it can be acted on.</p>

        {collectable.some((r) => (r.count ?? 0) > 0) && (
          <>
            <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Collect now</div>
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              {collectable.map((r) => <RevCard key={r.label} r={r} cur={cur} />)}
            </div>
          </>
        )}

        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Leaking</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          {leaks.map((r) => <RevCard key={r.label} r={r} cur={cur} />)}
        </div>

        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Pipeline &amp; growth</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {pipeline.map((r) => <RevCard key={r.label} r={r} cur={cur} />)}
        </div>
      </section>

      {/* Trainings */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="font-display font-semibold text-xl">Trainings worth running</h2>
          <div className="flex-1" />
          {data.trainings.length > 0 && (
            <ExportButton filename="training-recommendations" label="Export"
              rows={data.trainings.map((t) => ({
                training: t.title, priority: t.priority, evidence: t.evidence,
                audience: t.audience, projected_learners: t.projected_learners,
                projected_revenue: t.projected_revenue, downstream_placement_value: t.downstream_value
              }))} />
          )}
        </div>
        <p className="text-sm text-muted-2 mb-4">
          Each one is derived from a real failure — an employer requirement that rejected people,
          or demand the pool couldn&rsquo;t fill. None are generic suggestions.
        </p>

        {data.trainings.length === 0 ? (
          <div className="card p-6 text-sm text-muted">
            No training recommendations yet. These come from screening rejections and unfilled
            demand — once more jobs have run their course, patterns appear here.
          </div>
        ) : data.trainings.map((t, i) => (
          <div key={i} className="card p-5 mb-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-64">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    t.priority === "high" ? "bg-coral text-white"
                    : t.priority === "medium" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted-2"}`}>
                    {t.priority}
                  </span>
                  <span className="font-display font-semibold text-lg">{t.title}</span>
                </div>
                <p className="text-sm text-muted mt-2">{t.rationale}</p>
                <p className="text-sm text-ink mt-2 border-l-2 border-coral/40 pl-3">{t.evidence}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="numeral !text-2xl">{fmt(t.projected_revenue, cur)}</div>
                <div className="text-xs text-muted-2 mt-1">
                  {t.projected_learners} learners of {t.audience} reachable
                </div>
                {t.downstream_value > 0 && (
                  <div className="text-xs text-muted-2 mt-2">
                    + {fmt(t.downstream_value, cur)} in placement fees<br />if they then convert
                  </div>
                )}
              </div>
            </div>
            <Link href="/portal/admin/trainings" className="btn-ghost !h-9 text-xs mt-3 inline-flex">
              Create this training →
            </Link>
          </div>
        ))}
      </section>

      {/* Demand vs supply */}
      <section>
        <h2 className="font-display font-semibold text-xl mb-1">Demand against supply</h2>
        <p className="text-sm text-muted-2 mb-4">
          Last {data.window_days} days. Pressure is openings per 10 candidates — above 3 means
          employers are asking for more than the pool holds.
        </p>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-2 border-b border-line">
                <th className="py-3 px-4 font-semibold">Niche</th>
                <th className="py-3 px-3 font-semibold">Openings</th>
                <th className="py-3 px-3 font-semibold">Talent</th>
                <th className="py-3 px-3 font-semibold">Applied</th>
                <th className="py-3 px-3 font-semibold">Shortlisted</th>
                <th className="py-3 px-3 font-semibold">Pressure</th>
                <th className="py-3 px-4 font-semibold">Read</th>
              </tr>
            </thead>
            <tbody>
              {data.gaps.map((g) => (
                <tr key={g.niche} className="border-b border-line last:border-0 align-top">
                  <td className="py-3 px-4 font-semibold whitespace-nowrap">{g.niche}</td>
                  <td className="py-3 px-3">{g.openings}</td>
                  <td className="py-3 px-3">{g.talent}</td>
                  <td className="py-3 px-3">{g.applications}</td>
                  <td className="py-3 px-3">
                    {g.shortlisted}
                    {g.shortlist_rate !== null && (
                      <span className="text-muted-2"> ({Math.round(g.shortlist_rate * 100)}%)</span>
                    )}
                  </td>
                  <td className="py-3 px-3">{g.pressure >= 99 ? "—" : g.pressure}</td>
                  <td className="py-3 px-4 max-w-md">
                    <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mr-2 ${
                      g.verdict === "underserved" ? "bg-coral text-white"
                      : g.verdict === "weak_conversion" ? "bg-coral-soft text-coral"
                      : g.verdict === "oversupplied" ? "bg-paper-2 text-muted-2" : "bg-paper-2 text-muted-2"}`}>
                      {g.verdict.replace("_", " ")}
                    </span>
                    <span className="text-muted-2">{g.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Skill demand vs supply, read from job text and CV text */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="font-display font-semibold text-xl">Skills employers ask for, against skills the pool shows</h2>
          <div className="flex-1" />
          {data.skills.length > 0 && (
            <ExportButton filename="skill-demand-vs-supply" label="Export"
              rows={data.skills.map((s) => ({
                skill: s.term, verdict: s.verdict,
                job_posts_mentioning: s.demand, pct_of_posts: s.demand_pct,
                cvs_mentioning: s.supply, pct_of_cvs: s.supply_pct,
                gap_points: s.gap, niches: s.niches.join("; ")
              }))} />
          )}
        </div>
        <p className="text-sm text-muted-2 mb-4">
          Terms are read from the job descriptions employers actually wrote, then counted across
          indexed CVs. There is no external skills list behind this — the benchmark is the demand
          in your own market, which is the one attached to somebody&rsquo;s budget.
        </p>

        {data.skills.length === 0 ? (
          <div className="card p-6 text-sm text-muted">
            {data.skills_coverage.indexed === 0
              ? <>No CVs are indexed yet, so there is nothing to compare demand against.
                  Build the index on <Link href="/portal/admin/cv-search" className="text-coral font-medium">Search CVs</Link> first
                  {data.skills_coverage.pool_with_resume > 0 && ` — ${data.skills_coverage.pool_with_resume} CVs are waiting`}.</>
              : "Not enough job descriptions yet to read demand from. This needs a handful of posted roles to find a pattern."}
          </div>
        ) : (
          <>
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-2 border-b border-line">
                    <th className="py-3 px-4 font-semibold">Skill or term</th>
                    <th className="py-3 px-3 font-semibold">In job posts</th>
                    <th className="py-3 px-3 font-semibold">In CVs</th>
                    <th className="py-3 px-3 font-semibold">Gap</th>
                    <th className="py-3 px-4 font-semibold">Read</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skills.map((s) => (
                    <tr key={s.term} className="border-b border-line last:border-0">
                      <td className="py-3 px-4 font-semibold capitalize">{s.term}</td>
                      <td className="py-3 px-3">
                        {s.demand_pct}% <span className="text-muted-2">({s.demand})</span>
                      </td>
                      <td className="py-3 px-3">
                        {s.supply_pct}% <span className="text-muted-2">({s.supply})</span>
                      </td>
                      <td className={`py-3 px-3 font-semibold ${s.gap > 0 ? "text-coral" : "text-muted-2"}`}>
                        {s.gap > 0 ? `+${s.gap}` : s.gap}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          s.verdict === "critical" ? "bg-coral text-white"
                          : s.verdict === "short" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted-2"}`}>
                          {s.verdict}
                        </span>
                        {s.niches.length > 0 && (
                          <span className="text-xs text-muted-2 ml-2">{s.niches.join(", ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-2 mt-3">
              Read from {data.skills_coverage.jobs_read} job posts and {data.skills_coverage.cvs_read} indexed CVs.
              {data.skills_coverage.pool_with_resume > data.skills_coverage.indexed && (
                <> {data.skills_coverage.pool_with_resume - data.skills_coverage.indexed} CVs are not indexed yet
                  and are excluded — supply figures understate until that reaches zero.</>
              )}
              {" "}A CV that never mentions a skill may still have it; this measures what candidates
              evidence, which is also what employers see.
            </p>
          </>
        )}
      </section>

      {/* Screening failures */}
      {data.screening_failures.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">What keeps rejecting people</h2>
          <p className="text-sm text-muted-2 mb-4">
            Requirements employers set that candidates repeatedly fail. This is the most precise
            deficiency signal you have — an employer defined the bar and the pool missed it.
          </p>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-2 border-b border-line">
                  <th className="py-3 px-4 font-semibold">Requirement</th>
                  <th className="py-3 px-3 font-semibold">Job</th>
                  <th className="py-3 px-3 font-semibold">Rejected</th>
                  <th className="py-3 px-4 font-semibold">Of applicants</th>
                </tr>
              </thead>
              <tbody>
                {data.screening_failures.map((f, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-3 px-4">
                      <div className="font-semibold">{f.question}</div>
                      <div className="text-xs text-muted-2">needs {f.requirement}</div>
                    </td>
                    <td className="py-3 px-3 text-muted-2">
                      <Link href={`/portal/admin/jobs/${f.job_id}/applicants`} className="hover:text-ink">
                        {f.job_title}
                      </Link>
                    </td>
                    <td className="py-3 px-3 font-semibold text-coral">{f.failed}</td>
                    <td className="py-3 px-4 text-muted-2">
                      {f.applicants} ({Math.round(f.fail_rate * 100)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Wasted demand */}
      {(data.unserved.no_shortlist.length > 0 || data.unserved.no_applicants.length > 0) && (
        <section className="grid md:grid-cols-2 gap-4">
          {data.unserved.no_shortlist.length > 0 && (
            <div className="card p-5">
              <h3 className="font-display font-semibold mb-1">Applicants but nobody shortlisted</h3>
              <p className="text-sm text-muted-2 mb-3">
                The employer got a response and advanced nobody. Call them before they conclude
                the pool can&rsquo;t serve them.
              </p>
              {data.unserved.no_shortlist.map((j) => (
                <Link key={j.id} href={`/portal/admin/jobs/${j.id}/applicants`}
                  className="flex justify-between py-2 border-b border-line last:border-0 hover:text-coral">
                  <span className="text-sm">{j.title}</span>
                  <span className="text-sm text-muted-2">{j.applicants} applied</span>
                </Link>
              ))}
            </div>
          )}
          {data.unserved.no_applicants.length > 0 && (
            <div className="card p-5">
              <h3 className="font-display font-semibold mb-1">Open jobs drawing nothing</h3>
              <p className="text-sm text-muted-2 mb-3">
                Live for a week or more with no applications at all.
              </p>
              {data.unserved.no_applicants.map((j) => (
                <Link key={j.id} href={`/portal/admin/jobs/${j.id}`}
                  className="flex justify-between py-2 border-b border-line last:border-0 hover:text-coral">
                  <span className="text-sm">{j.title}</span>
                  <span className="text-sm text-muted-2">{j.days_open} days</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Health, costed */}
      <section>
        <h2 className="font-display font-semibold text-xl mb-1">What the pool is losing to data gaps</h2>
        <p className="text-sm text-muted-2 mb-4">
          Each of these makes real people invisible to employers who are already looking.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.health.map((h) => (
            <div key={h.label} className="card p-4">
              <div className="flex items-baseline gap-2">
                <span className="numeral !text-2xl">{h.count}</span>
                <span className="text-sm text-muted-2">of {h.of}</span>
              </div>
              <div className="font-semibold text-sm mt-1">{h.label}</div>
              <p className="text-xs text-muted-2 mt-1.5">{h.cost}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RevCard({ r, cur }: { r: any; cur: string }) {
  const tone = r.kind === "collectable" ? "border-coral/50"
    : r.kind === "leak" ? "border-coral/30" : "border-line";
  return (
    <div className={`card p-4 ${tone}`} style={r.kind === "collectable" ? { background: "#FFF4F2" } : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm">{r.label}</span>
        <span className="text-xs text-muted-2 shrink-0">{r.count}</span>
      </div>
      {r.amount !== null && (
        <div className="numeral !text-2xl mt-1.5">{fmt(r.amount, cur)}</div>
      )}
      <p className="text-xs text-muted-2 mt-2">{r.detail}</p>
      <p className="text-xs text-ink mt-2 font-medium">{r.action}</p>
    </div>
  );
}
