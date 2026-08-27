import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";

export const dynamic = "force-dynamic";

export default async function AdminPlacementsPage() {
  const admin = createAdminClient();
  const { data: placements } = await admin.from("placements")
    .select("id, is_elite, salary_monthly, fee_type, fee_amount, currency, status, created_at, employer_id, talent_id, job_id")
    .order("created_at", { ascending: false });

  const rows = [];
  for (const p of placements ?? []) {
    const [{ data: emp }, { data: tal }, { data: job }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", p.employer_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", p.talent_id).maybeSingle(),
      admin.from("jobs").select("title").eq("id", p.job_id).maybeSingle()
    ]);
    rows.push({ ...p, employer: emp?.full_name ?? "—", talent: tal?.full_name ?? "—", job: job?.title ?? "—" });
  }

  const totalPending = rows.filter((r: any) => r.status === "pending").reduce((a: number, r: any) => a + Number(r.fee_amount), 0);
  const exportRows = rows.map((r: any) => ({
    talent: r.talent, employer: r.employer, job: r.job,
    elite: r.is_elite ? "yes" : "no", fee_type: r.fee_type,
    fee: r.fee_amount, status: r.status, date: new Date(r.created_at).toLocaleDateString()
  }));

  return (
    <>
      <PageHeader
        title="Placements & fees"
        sub="Every hire made through the platform, with the fee due. Elite hires carry a percentage of salary; general hires a flat fee."
      />
      <div className="flex items-center justify-between mb-4">
        <div className="card px-5 py-3">
          <span className="text-sm text-muted-2">Pending fees</span>
          <span className="ml-3 font-display font-semibold text-xl">₦{totalPending.toLocaleString()}</span>
        </div>
        <ExportButton rows={exportRows} filename="placements" label="Export" />
      </div>
      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No placements yet. They appear when an employer marks a candidate hired.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r: any) => (
            <div key={r.id} className="card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {r.talent}
                  {r.is_elite && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-ink text-white">Elite</span>}
                </div>
                <div className="text-sm text-muted-2">hired by {r.employer} · {r.job}</div>
              </div>
              <div className="text-right">
                <div className="font-display font-semibold">₦{Number(r.fee_amount).toLocaleString()}</div>
                <div className="text-xs text-muted-2">
                  {r.fee_type === "percent" ? `% of salary` : "flat fee"} · <span className="capitalize">{r.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
