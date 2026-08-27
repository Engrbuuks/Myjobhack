import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";

export const dynamic = "force-dynamic";

/**
 * What a partner can promote: live roles and open trainings.
 * Read-only — partners surface opportunities, they don't manage them.
 */
export default async function PartnerOpportunities() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [{ data: jobs }, { data: trainings }] = await Promise.all([
    admin.from("jobs")
      .select("id, title, company_name, location, work_mode, role_level, openings, closes_at")
      .eq("status", "published")
      .or(`closes_at.is.null,closes_at.gt.${nowIso}`)
      .order("published_at", { ascending: false }).limit(50),
    admin.from("trainings")
      .select("id, title, price_ngn, status, starts_at")
      .in("status", ["open", "in_progress"]).order("starts_at", { ascending: true }).limit(30)
  ]);

  const exportRows = (jobs ?? []).map((j) => ({
    role: j.title, company: j.company_name ?? "", location: j.location ?? "",
    mode: j.work_mode ?? "", level: j.role_level ?? "", openings: j.openings ?? 1
  }));

  return (
    <>
      <PageHeader title="Opportunities"
        sub="Live roles and open trainings you can promote. Share these with your network using your referral links." />

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-lg">Open roles ({(jobs ?? []).length})</h3>
        <ExportButton rows={exportRows} filename="opportunities" label="Export" />
      </div>

      {(jobs ?? []).length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted mb-8">No open roles right now.</div>
      ) : (
        <div className="space-y-3 mb-10">
          {(jobs ?? []).map((j) => (
            <div key={j.id} className="card p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-48">
                <div className="font-semibold text-sm">{j.title}</div>
                <div className="text-xs text-muted-2">
                  {[j.company_name, j.location, j.work_mode, j.role_level].filter(Boolean).join(" · ")}
                </div>
              </div>
              {(j.openings ?? 1) > 1 && (
                <span className="px-2.5 py-1 rounded-pill bg-coral text-white text-[10px] font-bold uppercase tracking-wider">
                  {j.openings} openings
                </span>
              )}
              {j.closes_at && (
                <span className="text-xs text-muted-2 whitespace-nowrap">
                  closes {new Date(j.closes_at).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 className="font-display font-semibold text-lg mb-3">Open trainings ({(trainings ?? []).length})</h3>
      {(trainings ?? []).length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">No trainings open right now.</div>
      ) : (
        <div className="space-y-3">
          {(trainings ?? []).map((t) => (
            <div key={t.id} className="card p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-48">
                <div className="font-semibold text-sm">{t.title}</div>
                {t.starts_at && <div className="text-xs text-muted-2">starts {new Date(t.starts_at).toLocaleDateString()}</div>}
              </div>
              <span className="text-sm font-semibold">
                {Number(t.price_ngn) > 0 ? `₦${Number(t.price_ngn).toLocaleString()}` : "Free"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
