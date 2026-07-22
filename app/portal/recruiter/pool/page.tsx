import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SegmentFilterBar } from "@/components/SegmentFilterBar";
import { ExportButton } from "@/components/ExportButton";
import { filtersFromSearchParams, querySegment } from "@/lib/segment";

export const dynamic = "force-dynamic";

export default async function RecruiterPool({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = createClient();
  const filters = filtersFromSearchParams(searchParams);
  const [{ data: taxonomies }, rows] = await Promise.all([
    supabase.from("taxonomies").select("id, kind, label").eq("active", true).order("sort"),
    querySegment(supabase, filters)
  ]);
  const tmap = new Map((taxonomies ?? []).map((t) => [t.id, t.label]));

  const exportRows = (rows as any[]).map((r) => ({
    name: r.profile?.full_name ?? "", niche: r.niche_id ? tmap.get(r.niche_id) : "",
    level: r.expected_role_level ?? "", competency: r.competency_band ?? "",
    years: r.years_experience ?? 0, completion: r.profile_completion ?? 0
  }));

  return (
    <>
      <PageHeader title="Talent pool"
        sub="Slice the proven pool by niche, level and competency. Contact details stay protected — shortlist here, then engage through the platform." />
      <SegmentFilterBar taxonomies={taxonomies ?? []} />
      <div className="flex justify-end mb-3">
        <ExportButton rows={exportRows} filename="talent-pool" label="Export" />
      </div>

      {(rows as any[]).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No talent matches these filters yet.</div>
      ) : (
        <div className="space-y-3">
          {(rows as any[]).map((r) => (
            <div key={r.profile_id} className="card p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-48">
                <div className="font-semibold text-sm">{r.profile?.full_name ?? "Candidate"}</div>
                <div className="text-xs text-muted-2 truncate">
                  {r.headline || (r.niche_id ? tmap.get(r.niche_id) : "—")}
                </div>
              </div>
              {r.competency_band && (
                <div className="text-center">
                  <div className="font-display font-semibold text-coral">{r.competency_band}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2">Competency</div>
                </div>
              )}
              <div className="text-xs text-muted-2 capitalize whitespace-nowrap">
                {r.expected_role_level ?? "—"} · {r.years_experience ?? 0} yrs
              </div>
              <div className="text-xs text-muted-2 whitespace-nowrap">{r.profile_completion ?? 0}% complete</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
