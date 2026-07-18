import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Open roles — MYJOBHACK",
  description: "Every role currently hiring on MYJOBHACK. Apply in two minutes, no account required.",
  alternates: { canonical: "https://app.myjobhack.co/roles" }
};

export default async function RolesPage() {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("jobs")
    .select("id, title, location, work_mode, role_level, employment_type, salary_note, org_id, published_at")
    .eq("status", "published").order("published_at", { ascending: false }).limit(60);

  const orgIds = Array.from(new Set((jobs ?? []).map((j) => j.org_id).filter(Boolean))) as string[];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds);
    (orgs ?? []).forEach((o) => orgNames.set(o.id, o.name));
  }

  return (
    <div className="min-h-screen bg-ink text-white overflow-x-hidden">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3">
          <a href="https://myjobhack.co" className="font-bold text-lg tracking-tight">myjob<span className="text-coral">hack</span></a>
          <div className="flex items-center gap-5 text-sm font-semibold">
            <Link href="/login" className="text-white/60 hover:text-white transition">Sign in</Link>
            <Link href="/join" className="px-4 h-9 inline-flex items-center rounded-pill bg-coral text-white">Join free</Link>
          </div>
        </div>
      </header>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[8%] w-[75vw] max-w-[460px] aspect-square rounded-full bg-coral/[.12] blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-10 sm:pt-14 pb-8 sm:pb-10">
          <div className="text-[11px] font-extrabold uppercase tracking-[.26em] text-[#FFB4AC] mb-4">Open roles</div>
          <h1 className="font-display font-semibold text-[clamp(26px,7vw,48px)] leading-tight mb-3">
            {(jobs ?? []).length} {(jobs ?? []).length === 1 ? "role" : "roles"} hiring now.
          </h1>
          <p className="text-white/55 max-w-xl">Apply in two minutes — no account needed. Meet the requirements and you're shortlisted instantly.</p>
        </div>

        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pb-12 sm:pb-16">
          {(jobs ?? []).length === 0 ? (
            <div className="rounded-card border border-white/10 p-12 text-center">
              <div className="font-display font-semibold text-2xl mb-2">No open roles this moment.</div>
              <p className="text-white/50 text-sm mb-6">Build your profile and new roles will find you the day they're posted.</p>
              <Link href="/join" className="btn-coral">Create my free profile →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {(jobs ?? []).map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`}
                  className="group rounded-card border border-white/10 hover:border-coral/50 transition p-6 flex flex-wrap items-center gap-5">
                  <span className="w-12 h-12 rounded-full bg-coral grid place-items-center font-display font-semibold text-xl shrink-0">
                    {(j.org_id ? orgNames.get(j.org_id) ?? "M" : "M")[0]}
                  </span>
                  <span className="flex-1 min-w-52">
                    <span className="block font-display font-semibold text-lg group-hover:text-coral transition">{j.title}</span>
                    <span className="block text-xs text-white/45 mt-1 capitalize">
                      {[j.org_id ? orgNames.get(j.org_id) : "MYJOBHACK", j.location, j.work_mode, j.employment_type?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {j.salary_note && <span className="text-sm text-white/70">{j.salary_note}</span>}
                  <span className="text-coral font-bold text-sm shrink-0">Apply →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/35">
        MYJOBHACK — Africa's workforce, transformed. <a href="https://myjobhack.co" className="text-coral font-semibold">myjobhack.co</a>
      </footer>
    </div>
  );
}
