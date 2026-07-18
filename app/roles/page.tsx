import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { denominate } from "@/lib/currency";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Open roles — MYJOBHACK",
  description: "Every role currently hiring on MYJOBHACK. Apply in two minutes, no account required.",
  alternates: { canonical: "https://app.myjobhack.co/roles" }
};

export default async function RolesPage({ searchParams }: { searchParams: { q?: string; mode?: string } }) {
  const admin = createAdminClient();
  const { data: allJobs } = await admin.from("jobs")
    .select("id, title, location, work_mode, role_level, employment_type, salary_note, salary_currency, org_id, published_at")
    .eq("status", "published").order("published_at", { ascending: false }).limit(80);

  const orgIds = Array.from(new Set((allJobs ?? []).map((j) => j.org_id).filter(Boolean))) as string[];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds);
    (orgs ?? []).forEach((o) => orgNames.set(o.id, o.name));
  }

  const q = (searchParams.q ?? "").toLowerCase().trim();
  const mode = searchParams.mode ?? "";
  const jobs = (allJobs ?? []).filter((j) => {
    if (mode && j.work_mode !== mode) return false;
    if (!q) return true;
    const hay = `${j.title} ${j.location ?? ""} ${j.role_level ?? ""} ${j.org_id ? orgNames.get(j.org_id) ?? "" : ""}`.toLowerCase();
    return hay.includes(q);
  });

  const isNew = (d: string | null) => d ? (Date.now() - new Date(d).getTime()) < 5 * 864e5 : false;
  const MODES = [["", "All"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]] as const;
  const chipHref = (m: string) => `/roles?${new URLSearchParams({ ...(q ? { q } : {}), ...(m ? { mode: m } : {}) })}`;

  return (
    <div className="min-h-screen bg-ink text-white overflow-x-hidden">
      {/* compact bar — brand, count, search, join. Jobs start immediately below. */}
      <header className="sticky top-0 z-40 bg-ink/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
          <a href="https://myjobhack.co" className="font-bold tracking-tight shrink-0">myjob<span className="text-coral">hack</span></a>
          <span className="hidden sm:inline text-xs text-white/40 shrink-0">
            <b className="text-coral">{jobs.length}</b> hiring now
          </span>
          <form className="flex-1 min-w-0" action="/roles">
            {mode && <input type="hidden" name="mode" value={mode} />}
            <input name="q" defaultValue={q} placeholder="Search roles…"
              className="w-full h-10 rounded-pill bg-white/[.08] border border-white/12 px-4 text-sm outline-none placeholder:text-white/35 focus:border-coral/50 transition" />
          </form>
          <Link href="/join" className="shrink-0 px-4 h-10 inline-flex items-center rounded-pill bg-coral text-white text-sm font-bold">Join free</Link>
        </div>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {MODES.map(([v, l]) => (
            <Link key={v} href={chipHref(v)}
              className={`px-3.5 h-8 inline-flex items-center rounded-pill border text-xs font-bold whitespace-nowrap transition ${
                mode === v ? "bg-coral border-coral text-white" : "border-white/15 text-white/60 hover:border-coral"}`}>
              {l}
            </Link>
          ))}
          <span className="sm:hidden px-3.5 h-8 inline-flex items-center text-xs text-white/40 whitespace-nowrap">
            {jobs.length} hiring now
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-6 py-5">
        {jobs.length === 0 ? (
          <div className="rounded-card border border-white/10 p-10 text-center mt-6">
            <div className="font-display font-semibold text-2xl mb-2">
              {q || mode ? "Nothing matches that." : "No open roles this moment."}
            </div>
            <p className="text-white/50 text-sm mb-6">
              {q || mode ? "Try a broader search — or let roles find you instead." : "Build your profile and new roles will find you the day they're posted."}
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              {(q || mode) && <Link href="/roles" className="inline-flex items-center px-5 h-11 rounded-pill border border-white/20 text-sm font-bold">Clear filters</Link>}
              <Link href="/join" className="btn-coral">Create my free profile →</Link>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {jobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`}
                className="group relative rounded-2xl border border-white/10 hover:border-coral/60 bg-white/[.03] hover:bg-white/[.06] transition p-4 sm:p-5 flex flex-col min-w-0">
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-10 h-10 rounded-xl bg-coral grid place-items-center font-display font-semibold shrink-0">
                    {(j.org_id ? orgNames.get(j.org_id) ?? "M" : "M")[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug group-hover:text-coral transition line-clamp-2">{j.title}</div>
                    <div className="text-xs text-white/45 truncate mt-0.5">
                      {j.org_id ? orgNames.get(j.org_id) ?? "MYJOBHACK" : "MYJOBHACK"}
                    </div>
                  </div>
                  {isNew(j.published_at) && (
                    <span className="px-2 py-0.5 rounded-pill bg-coral/20 text-coral text-[9px] font-extrabold uppercase tracking-widest shrink-0">New</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[j.location, j.work_mode, j.employment_type?.replace(/_/g, " "), j.role_level]
                    .filter(Boolean).slice(0, 4).map((m) => (
                      <span key={m as string} className="px-2.5 py-1 rounded-pill bg-white/[.07] text-[11px] text-white/70 capitalize">{m}</span>
                    ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-sm font-semibold text-white/80 truncate">{denominate(j.salary_note, j.salary_currency) || "\u00A0"}</span>
                  <span className="text-coral font-bold text-sm shrink-0">Apply →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {jobs.length > 0 && (
          <div className="relative overflow-hidden rounded-card border border-white/10 bg-white/[.04] p-6 sm:p-7 mt-6 text-center">
            <div className="pointer-events-none absolute -top-16 -right-10 w-[55vw] max-w-56 aspect-square rounded-full bg-coral/[.14] blur-3xl" />
            <div className="relative">
              <div className="font-display font-semibold text-xl sm:text-2xl mb-2">Let the next one find you.</div>
              <p className="text-white/55 text-sm mb-5 max-w-md mx-auto">
                Members are matched to roles automatically and shortlisted the moment they qualify. Free, two minutes.
              </p>
              <Link href="/join" className="btn-coral">Create my free profile →</Link>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 py-7 text-center text-xs text-white/35">
        MYJOBHACK — Africa's workforce, transformed. <a href="https://myjobhack.co" className="text-coral font-semibold">myjobhack.co</a>
      </footer>
    </div>
  );
}
