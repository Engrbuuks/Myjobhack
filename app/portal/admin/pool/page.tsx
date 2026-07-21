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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted border-b border-line">
                <th className="px-4 py-3"></th>
                <th className="px-5 py-3 font-bold">Name</th>
                <th className="px-5 py-3 font-bold">Niche</th>
                <th className="px-5 py-3 font-bold">Goal</th>
                <th className="px-5 py-3 font-bold">Level</th>
                <th className="px-5 py-3 font-bold">Expectation</th>
                <th className="px-5 py-3 font-bold">Complete</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profile_id} className="border-b border-line last:border-0 hover:bg-paper transition">
                  <td className="px-4 py-3"><RowCheckbox id={r.profile_id} /></td>
                  <td className="px-5 py-3">
                    <div className="font-semibold">{r.profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-2">{r.headline || r.profile?.email}</div>
                  </td>
                  <td className="px-5 py-3">{r.niche_id ? tmap.get(r.niche_id) : "—"}</td>
                  <td className="px-5 py-3">{r.career_goal_id ? tmap.get(r.career_goal_id) : "—"}</td>
                  <td className="px-5 py-3 capitalize">{r.expected_role_level ?? "—"}</td>
                  <td className="px-5 py-3">
                    {r.salary_min
                      ? `${r.salary_currency} ${Number(r.salary_min).toLocaleString()}–${Number(r.salary_max ?? r.salary_min).toLocaleString()}`
                      : "—"}
                    <span className="text-muted-2"> · {r.preferred_work_mode ?? "—"}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-grid place-items-center min-w-11 h-6 px-2 rounded-pill text-xs font-bold ${
                      r.profile_completion >= 100 ? "bg-ink text-white" : "bg-coral-soft text-coral"
                    }`}>{r.profile_completion}%</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex items-center gap-3">
                      <RequestCredentialsButton profileId={r.profile_id} compact />
                      <Link href={`/portal/admin/pool/${r.profile_id}`} className="text-coral font-semibold">View →</Link>
                    </span>
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
