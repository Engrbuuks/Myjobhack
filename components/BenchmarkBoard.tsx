"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { callApi, postJson } from "@/lib/apiClient";
import { ExportButton } from "@/components/ExportButton";

/**
 * What the market requires, against what the pool can evidence.
 *
 * Works with zero employers on the platform, which is the point — the
 * benchmark is fetched from the live web rather than inferred from postings
 * that don't exist yet.
 */
export function BenchmarkBoard({ niches }: { niches: { id: string; label: string }[] }) {
  const [nicheId, setNicheId] = useState(niches[0]?.id ?? "");
  const [level, setLevel] = useState("");
  const [region, setRegion] = useState("Nigeria");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [mix, setMix] = useState<any>(null);
  const [boards, setBoards] = useState("");
  const [showBoards, setShowBoards] = useState(false);

  async function load(id = nicheId) {
    const r = await callApi(`/api/admin/benchmark${id ? `?niche_id=${id}` : ""}`);
    if (r.ok) { setData(r.data); setErr(null); } else setErr(r.error);
  }
  useEffect(() => { if (nicheId) load(nicheId); }, [nicheId]);

  async function fetchMarket() {
    setBusy(true); setNote(null); setErr(null);
    try {
      const r = await postJson("/api/admin/benchmark", {
        niche_id: nicheId, role_level: level || null, region,
        boards: boards.trim() ? boards.split(",").map((b) => b.trim()).filter(Boolean) : undefined
      });
      if (r.ok) {
        setNote(r.data?.message ?? "Done.");
        setSources(r.data?.sources ?? []);
        setMix(r.data?.source_mix ?? null);
        if (!boards.trim() && r.data?.boards_searched) setBoards(r.data.boards_searched.join(", "));
      }
      else setErr(r.error);
    } finally { setBusy(false); }
    load();
  }

  async function patch(id: string, body: any) {
    await callApi("/api/admin/benchmark", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body })
    });
    load();
  }

  async function remove(id: string) {
    await callApi(`/api/admin/benchmark?id=${id}`, { method: "DELETE" });
    load();
  }

  const coverage = data?.coverage ?? [];
  const gaps = coverage.filter((c: any) => c.verdict === "critical" || c.verdict === "weak");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-xl mb-1">What the market requires</h2>
        <p className="text-sm text-muted-2">
          Fetched from a live web search, then measured against your indexed CVs. This works with
          no employers on the platform — you don&rsquo;t have to wait for postings to find out
          where the pool is thin.
        </p>
      </div>

      {err && (
        <div className="card p-4 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink mb-1">This didn&rsquo;t work</div>
          <p className="text-sm text-muted">{err}</p>
        </div>
      )}

      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label !text-xs">Niche</label>
            <select className="input !h-10 !w-auto text-sm" value={nicheId}
              onChange={(e) => setNicheId(e.target.value)}>
              {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label !text-xs">Level</label>
            <select className="input !h-10 !w-auto text-sm" value={level}
              onChange={(e) => setLevel(e.target.value)}>
              <option value="">Any</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
            </select>
          </div>
          <div>
            <label className="label !text-xs">Market</label>
            <input className="input !h-10 !w-36 text-sm" value={region}
              onChange={(e) => setRegion(e.target.value)} />
          </div>
          <button className="btn-coral !h-10 text-sm" onClick={fetchMarket} disabled={busy || !nicheId}>
            {busy ? "Searching the web…" : "Fetch current requirements"}
          </button>
        </div>
        <div className="mt-3">
          <button className="text-xs text-muted hover:text-ink underline"
            onClick={() => setShowBoards((b) => !b)}>
            {showBoards ? "Hide" : "Which job boards?"}
          </button>
          {showBoards && (
            <div className="mt-2">
              <input className="input !h-9 text-xs" value={boards}
                placeholder="jobberman.com, myjobmag.com, hotnigerianjobs.com…"
                onChange={(e) => setBoards(e.target.value)} />
              <p className="text-xs text-muted-2 mt-1.5">
                The search is pointed at these boards, alongside skills reports, professional
                bodies and training curricula. Boards are never the only source — live ads show
                what is being hired this month, which is seasonal.
              </p>
            </div>
          )}
        </div>

        {note && <p className="text-sm text-ink font-medium mt-3">{note}</p>}

        {mix?.warning && (
          <p className="text-sm text-coral font-medium mt-2">⚠ {mix.warning}</p>
        )}
        {mix && (mix.job_boards.length > 0 || mix.other.length > 0) && (
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1.5">
                Job boards ({mix.job_boards.length})
              </div>
              {mix.job_boards.length === 0
                ? <p className="text-xs text-muted-2">None reached this time.</p>
                : <div className="flex flex-wrap gap-1.5">
                    {mix.job_boards.map((s: any, i: number) => (
                      <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer"
                        className="rounded-pill bg-coral-soft text-coral px-2.5 py-1 text-xs hover:underline">
                        {s.host} ↗
                      </a>
                    ))}
                  </div>}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1.5">
                Reports &amp; other sources ({mix.other.length})
              </div>
              {mix.other.length === 0
                ? <p className="text-xs text-muted-2">None reached this time.</p>
                : <div className="flex flex-wrap gap-1.5">
                    {mix.other.map((s: any, i: number) => (
                      <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer"
                        className="rounded-pill border border-line bg-white px-2.5 py-1 text-xs text-muted hover:text-coral hover:border-coral transition">
                        {s.host} ↗
                      </a>
                    ))}
                  </div>}
            </div>
          </div>
        )}
        {data?.pool_indexed === 0 && (
          <p className="text-xs text-coral font-medium mt-3">
            No CVs are indexed, so coverage will read 0% for everything. Build the index
            on <Link href="/portal/admin/cv-search" className="underline">Search CVs</Link> first.
          </p>
        )}
        {data?.unapproved > 0 && (
          <p className="text-xs text-muted-2 mt-3">
            {data.unapproved} skill{data.unapproved === 1 ? " is" : "s are"} awaiting your review.
            Check the sources, then approve or remove — a model&rsquo;s reading of the web is a
            starting point, not a finding about your market.
          </p>
        )}
      </div>

      {coverage.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">
              <strong className="text-ink">{gaps.length}</strong> of {coverage.length} required
              skills are thin or missing across {data.pool_indexed} indexed CVs.
            </p>
            <div className="flex-1" />
            <ExportButton filename="market-skill-gaps" label="Export"
              rows={coverage.map((c: any) => ({
                skill: c.skill, importance: c.importance, verdict: c.verdict,
                cvs_with_it: c.have, pool: c.pool, coverage_pct: c.coverage_pct,
                why_market_wants_it: c.why, approved: c.approved ? "yes" : "pending review",
                sources: (c.sources ?? []).map((s: any) => s.uri).join(" ")
              }))} />
          </div>

          <div className="space-y-2">
            {coverage.map((c: any) => (
              <div key={c.id} className={`card p-4 ${c.verdict === "critical" ? "border-coral/40" : ""}`}
                style={c.verdict === "critical" ? { background: "#FFF4F2" } : undefined}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold text-lg">{c.skill}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        c.importance === "core" ? "bg-ink text-white"
                        : c.importance === "important" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted-2"}`}>
                        {c.importance}
                      </span>
                      {!c.approved && (
                        <span className="rounded-pill border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-2">
                          unreviewed
                        </span>
                      )}
                    </div>
                    {c.why && <p className="text-sm text-muted mt-1.5">{c.why}</p>}
                    {(c.sources ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.sources.slice(0, 3).map((s: any, i: number) => (
                          <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-muted-2 underline hover:text-coral">
                            {s.title ? s.title.slice(0, 40) : "source"} ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`numeral !text-2xl ${c.verdict === "critical" ? "text-coral" : ""}`}>
                      {c.coverage_pct}%
                    </div>
                    <div className="text-xs text-muted-2 mt-0.5">
                      {c.have} of {c.pool} CVs
                    </div>
                    <div className="flex gap-1 mt-2 justify-end">
                      {!c.approved && (
                        <button className="btn-ghost !h-8 text-xs"
                          onClick={() => patch(c.id, { approved: true })}>Approve</button>
                      )}
                      <button className="btn-ghost !h-8 text-xs" onClick={() => remove(c.id)}>Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-2">
            Coverage measures what candidates <em>write on their CV</em>. Someone may hold a skill
            and never mention it — but employers can&rsquo;t see it either, so a low figure is worth
            acting on regardless, sometimes by teaching people to put it in writing.
          </p>
        </>
      )}
    </section>
  );
}
