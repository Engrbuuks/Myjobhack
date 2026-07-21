import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SegmentFilterBar } from "@/components/SegmentFilterBar";
import { RequestCredentialsButton } from "@/components/RequestCredentialsButton";
import { PoolSelectionProvider, RowCheckbox } from "@/components/PoolSelectionBar";
import { filtersFromSearchParams, querySegment } from "@/lib/segment";

export default async function PoolPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = createClient();
  const filters = filtersFromSearchParams(searchParams);
  const [{ data: taxonomies }, rows] = await Promise.all([
    supabase.from("taxonomies").select("id, kind, label").eq("active", true).order("sort"),
    querySegment(supabase, filters)
  ]);
  const tmap = new Map((taxonomies ?? []).map((t) => [t.id, t.label]));
  const allProfileIds: string[] = [];
  for (const r of rows as any[]) allProfileIds.push(r.profile_id);
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][]
  ).toString();

  return (
    <>
      <PageHeader
        title="Talent CRM"
        sub="Slice the pool on the four axes. Any segment you build here can be sent training invites in one click."
        action={
          <Link href={`/portal/admin/invites${qs ? `?${qs}` : ""}`} className="btn-coral">
            Invite this segment ✉
          </Link>
        }
      />
      <SegmentFilterBar taxonomies={taxonomies ?? []} />

      <div className="mb-4 text-sm text-muted">
        <b className="font-display text-2xl text-ink mr-2">{rows.length}</b>
        talent in this segment {rows.length === 500 && "(showing first 500)"}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No talent matches this segment yet. Loosen a filter, or wait — the pool is filling.
        </div>
      ) : (
        <PoolSelectionProvider allIds={allProfileIds}>
          <div className="card overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                <th className="w-9 pl-3 pr-1 py-3"></th>
                <th className="px-3 py-3 font-bold">Name</th>
                <th className="px-3 py-3 font-bold hidden md:table-cell w-[16%]">Niche</th>
                <th className="px-3 py-3 font-bold hidden lg:table-cell w-[14%]">Goal</th>
                <th className="px-3 py-3 font-bold hidden sm:table-cell w-[10%]">Level</th>
                <th className="px-3 py-3 font-bold hidden xl:table-cell w-[16%]">Expectation</th>
                <th className="px-3 py-3 font-bold w-[8%]">Done</th>
                <th className="px-3 py-3 w-[18%]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profile_id} className="border-b border-line last:border-0 hover:bg-paper transition align-middle">
                  <td className="pl-3 pr-1 py-3"><RowCheckbox id={r.profile_id} /></td>
                  <td className="px-3 py-3">
                    <div className="font-semibold truncate">{r.profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-2 truncate">{r.headline || r.profile?.email}</div>
                  </td>
                  <td className="px-3 py-3 truncate hidden md:table-cell">{r.niche_id ? tmap.get(r.niche_id) : "—"}</td>
                  <td className="px-3 py-3 truncate hidden lg:table-cell">{r.career_goal_id ? tmap.get(r.career_goal_id) : "—"}</td>
                  <td className="px-3 py-3 capitalize hidden sm:table-cell">{r.expected_role_level ?? "—"}</td>
                  <td className="px-3 py-3 truncate hidden xl:table-cell">
                    {r.salary_min
                      ? `${r.salary_currency} ${Number(r.salary_min).toLocaleString()}`
                      : "—"}
                    <span className="text-muted-2"> · {r.preferred_work_mode ?? "—"}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-grid place-items-center min-w-9 h-6 px-1.5 rounded-pill text-xs font-bold ${
                      r.profile_completion >= 100 ? "bg-ink text-white" : "bg-coral-soft text-coral"
                    }`}>{r.profile_completion}%</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <RequestCredentialsButton profileId={r.profile_id} compact />
                      <Link href={`/portal/admin/pool/${r.profile_id}`} className="text-coral font-semibold">View →</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </PoolSelectionProvider>
      )}
    </>
  );
}
