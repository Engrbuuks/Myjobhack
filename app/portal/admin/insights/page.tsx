import { PageHeader } from "@/components/PageHeader";
import { getPoolStats, type PoolFilters } from "@/lib/poolStats";
import { BarList, TrendChart, Donut } from "@/components/PoolCharts";
import { PoolFilterBar } from "@/components/PoolFilterBar";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-muted-2 mb-2">{label}</div>
      <div className="font-display font-semibold text-3xl text-ink leading-none">{value}</div>
      {sub && <div className="text-xs text-muted-2 mt-2">{sub}</div>}
    </div>
  );
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-line bg-white p-6 ${wide ? "lg:col-span-2" : ""}`}>
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-2 mb-5">{title}</h3>
      {children}
    </div>
  );
}

export default async function PoolInsights({
  searchParams
}: { searchParams: Record<string, string | string[] | undefined> }) {
  const filters: PoolFilters = {
    niche_id: (searchParams.niche_id as string) || undefined,
    country: (searchParams.country as string) || undefined,
    state: (searchParams.state as string) || undefined,
    verification: (searchParams.verification as string) || undefined,
    work_mode: (searchParams.work_mode as string) || undefined,
    role_level: (searchParams.role_level as string) || undefined,
    years_bucket: (searchParams.years_bucket as string) || undefined
  };

  const admin = createAdminClient();
  const [stats, { data: niches }, { data: geoRows }] = await Promise.all([
    getPoolStats(filters),
    admin.from("taxonomies").select("id, label").eq("kind", "niche").order("sort"),
    admin.from("profiles").select("country, state")
  ]);
  const countries = Array.from(new Set((geoRows ?? []).map((r: any) => r.country).filter(Boolean))).sort();
  const states = Array.from(new Set((geoRows ?? []).map((r: any) => r.state).filter(Boolean))).sort();

  const t = stats.totals;
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Talent Pool Insights"
        sub="The shape of who's on the platform — by niche, geography, and status. Filter any axis to drill in."
      />

      {/* headline counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total talent pool" value={t.total_pool.toLocaleString()} sub={`${t.talent} members + ${t.total_pool - t.talent} guest applicants`} />
        <Kpi label="Registered members" value={t.talent.toLocaleString()} sub={`${t.elite} elite · ${t.employers} employers`} />
        <Kpi label="Verified" value={t.verified.toLocaleString()} sub={t.talent ? `${Math.round((t.verified / t.talent) * 100)}% of talent` : "—"} />
        <Kpi label="Missing location" value={t.missing_location.toLocaleString()} sub={t.missing_location > 0 ? "talent haven't set country/state" : "everyone has a location"} />
      </div>

      <PoolFilterBar niches={niches ?? []} current={filters} countries={countries} states={states} />

      {anyFilter && (
        <div className="mb-4 text-sm text-muted-2">
          Showing <b className="text-ink">{stats.filtered_total.toLocaleString()}</b> talent matching this filter.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Signups over time (last 12 months)" wide>
          <TrendChart data={stats.by_month} />
        </Panel>

        <Panel title="By niche">
          <BarList data={stats.by_niche} />
        </Panel>

        <Panel title="By country">
          <BarList data={stats.by_country} />
        </Panel>

        <Panel title="By state">
          <BarList data={stats.by_state} />
        </Panel>

        <Panel title="By verification status">
          <Donut data={stats.by_verification.length ? stats.by_verification : [{ key: "none", label: "No data", count: 1 }]} />
        </Panel>

        <Panel title="By preferred work mode">
          <Donut data={stats.by_work_mode.length ? stats.by_work_mode : [{ key: "none", label: "No data", count: 1 }]} />
        </Panel>

        <Panel title="By expected role level">
          <BarList data={stats.by_role_level} />
        </Panel>

        <Panel title="By years of experience">
          <BarList data={stats.by_years} />
        </Panel>
      </div>
    </>
  );
}
