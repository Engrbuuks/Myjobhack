"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ExportButton } from "@/components/ExportButton";
import { callApi, postJson } from "@/lib/apiClient";

/**
 * Search the whole pool by what people's CVs actually say.
 *
 * Built for the request that has no field: "I need someone who speaks
 * Spanish." Nobody was ever asked that, so it exists only in free text.
 */
export function ResumeSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "any" | "phrase">("all");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [coverage, setCoverage] = useState<any>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexNote, setIndexNote] = useState<string | null>(null);
  const [includeGuests, setIncludeGuests] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  async function loadCoverage() {
    const r = await callApi("/api/admin/index-resumes");
    if (r.ok) { setCoverage(r.data); setSetupError(null); }
    else setSetupError(r.error);
  }
  useEffect(() => { loadCoverage(); }, []);

  async function runIndex() {
    setIndexing(true); setIndexNote(null); setSetupError(null);
    try {
      const r = await postJson("/api/admin/index-resumes", { include_guests: includeGuests });
      if (r.ok) setIndexNote(r.data?.message ?? "Done.");
      else setSetupError(r.error);
    } finally {
      // In a finally block so a failure can never leave the button stuck
      // on "Indexing…" with nothing on screen.
      setIndexing(false);
    }
    loadCoverage();
  }

  async function search() {
    if (!query.trim()) return;
    setBusy(true); setRes(null); setSetupError(null);
    try {
      const r = await postJson("/api/admin/search-resumes", { query, mode });
      if (r.ok) setRes(r.data);
      else setSetupError(r.error);
    } finally {
      setBusy(false);
    }
  }

  const results = res?.results ?? [];
  const exportRows = results.map((r: any) => ({
    name: r.name, email: r.email, location: r.location, headline: r.headline,
    years: r.years ?? "", level: r.level, competency: r.band,
    matched: (r.matched_terms ?? []).join("; "),
    in_pool: r.is_guest ? "guest applicant" : "pool member",
    cv_link: typeof window !== "undefined" ? `${window.location.origin}${r.resume_url}` : r.resume_url,
    evidence: r.snippet ?? ""
  }));

  const notIndexed = coverage?.remaining ?? 0;

  return (
    <div className="space-y-4">
      {setupError && (
        <div className="card p-4 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink mb-1">This didn&rsquo;t work</div>
          <p className="text-sm text-muted">{setupError}</p>
        </div>
      )}

      {/* Index coverage — searching an empty index silently returns nothing,
          so the state of the index is shown before anyone searches. */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <strong className="text-ink">{coverage?.indexed ?? "—"}</strong>
            <span className="text-muted-2"> of {coverage?.pool_with_resume ?? "—"} pool CVs indexed</span>
            {coverage?.guest_applications_indexed > 0 && (
              <span className="text-muted-2"> · {coverage.guest_applications_indexed} guest applications</span>
            )}
            {coverage?.unreadable > 0 && (
              <span className="text-muted-2"> · {coverage.unreadable} unreadable</span>
            )}
          </div>
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4"
              checked={includeGuests} onChange={(e) => setIncludeGuests(e.target.checked)} />
            Include guest applicants
          </label>
          <button className="btn-ghost !h-9 text-xs" onClick={runIndex} disabled={indexing}>
            {indexing ? "Indexing…" : notIndexed > 0 ? `Index ${Math.min(notIndexed, 25)} more` : "Re-check"}
          </button>
        </div>
        {notIndexed > 0 && (
          <p className="text-xs text-coral font-medium mt-2">
            {notIndexed} CV{notIndexed === 1 ? "" : "s"} not yet indexed — they will NOT appear in results.
            Indexing runs 25 at a time; click until it reaches zero.
          </p>
        )}
        {indexNote && <p className="text-xs text-muted mt-2">{indexNote}</p>}
      </div>

      {/* Search */}
      <div className="card p-5">
        <label className="label">What do you need?</label>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-64" value={query}
            placeholder="Spanish · forklift licence · SAP, payroll"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()} />
          <select className="input !w-auto" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="all">All these words</option>
            <option value="any">Any of these words</option>
            <option value="phrase">This exact phrase</option>
          </select>
          <button className="btn-coral" onClick={search} disabled={busy || !query.trim()}>
            {busy ? "Searching…" : "Search CVs"}
          </button>
        </div>
        <p className="text-xs text-muted-2 mt-2">
          Searches the full text of every indexed CV — including skills nobody was ever asked about.
          Word forms are matched too, so &ldquo;Spanish&rdquo; also finds &ldquo;Spanish-speaking&rdquo;.
        </p>
      </div>

      {res?.message && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">{res.message}</p>
          <div className="flex-1" />
          {results.length > 0 && (
            <ExportButton rows={exportRows}
              filename={`cv-search-${(res.terms ?? []).join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              label="Export results" />
          )}
        </div>
      )}

      {results.map((r: any) => (
        <div key={r.profile_id ?? r.application_id} className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-semibold text-lg">{r.name}</span>
                {r.is_guest && (
                  <span className="rounded-pill bg-paper-2 border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-2">
                    Guest — not in pool
                  </span>
                )}
                {(r.matched_terms ?? []).map((t: string) => (
                  <span key={t} className="rounded-pill bg-coral-soft text-coral px-2.5 py-0.5 text-xs font-semibold">
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-sm text-muted-2 mt-1">
                {[r.headline, r.location, r.years != null && `${r.years} yrs`, r.level, r.band]
                  .filter(Boolean).join(" · ")}
              </div>
              {r.snippet && (
                <p className="text-sm text-muted mt-2 italic border-l-2 border-line pl-3">
                  {r.snippet}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <a href={r.resume_url} target="_blank" rel="noopener noreferrer" className="btn-ghost !h-9 text-xs">
                View CV
              </a>
              {r.profile_id && (
                <Link href={`/portal/admin/pool/${r.profile_id}`} className="btn-ghost !h-9 text-xs">
                  Profile
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}

      {res && results.length > 0 && (
        <p className="text-xs text-muted-2">
          The snippet is the text around the first match — read it before shortlisting. A CV
          mentioning Spanish might be listing a course, not fluency.
        </p>
      )}
    </div>
  );
}
