import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";

export const dynamic = "force-dynamic";

export default async function RecruiterJobs() {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("jobs")
    .select("id, title, status, location, work_mode, role_level, openings, hired_count, closes_at, created_at, company_name")
    .order("created_at", { ascending: false }).limit(100);

  const rows = jobs ?? [];
  const open = rows.filter((j) => j.status === "published").length;

  const exportRows = rows.map((j) => ({
    title: j.title, company: j.company_name ?? "", status: j.status,
    location: j.location ?? "", openings: j.openings ?? 1, hired: j.hired_count ?? 0,
    closes: j.closes_at ? new Date(j.closes_at).toLocaleDateString() : ""
  }));

  return (
    <>
      <PageHeader title="Jobs" sub={`Every role on the platform — ${open} currently open. Work them, fill them, track progress.`} />
      <div className="flex justify-end mb-3"><ExportButton rows={exportRows} filename="jobs" label="Export" /></div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No jobs posted yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((j) => {
            const openings = j.openings ?? 1;
            const hired = j.hired_count ?? 0;
            const pct = openings > 1 ? Math.min(100, Math.round((hired / openings) * 100)) : null;
            return (
              <div key={j.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-48">
                    <div className="font-semibold text-sm">{j.title}</div>
                    <div className="text-xs text-muted-2">
                      {[j.company_name, j.location, j.work_mode, j.role_level].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
                    j.status === "published" ? "bg-ink text-white" : "bg-paper-2 text-muted"}`}>{j.status}</span>
                  {openings > 1 && (
                    <span className="text-xs text-muted-2 whitespace-nowrap">{hired} of {openings} hired</span>
                  )}
                  <Link href={`/portal/recruiter/shortlists?job=${j.id}`} className="btn-ghost !h-9 text-xs">Shortlist →</Link>
                </div>
                {pct !== null && (
                  <div className="h-2 rounded-full bg-paper-2 overflow-hidden mt-3">
                    <div className="h-full bg-coral rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
