/**
 * What people are actually being paid, computed from placements this
 * platform recorded.
 *
 * THE RULE THIS FILE EXISTS TO HOLD. Every number here is measured. Nothing
 * is modelled, interpolated, or filled in to make a table look complete.
 * Migration 0062 already had to clear fabricated percentiles out of this
 * database once; a benchmark is worth having only if a member can act on it.
 *
 * THE OTHER RULE. A salary is personal. Published in a small enough group, an
 * average is a way of reading one person's pay: three placements in a city
 * and a median tells you almost exactly what the one you know earns. So no
 * group is published below the suppression floor, and the floor is a setting
 * rather than a constant so it can be raised but is never quietly zero.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { eliteSettings } from "@/lib/elite";

export type Band = {
  label: string;
  /** How many placements this row is computed from. Always shown. */
  n: number;
  median: number;
  p25: number;
  p75: number;
};

export type Benchmark = {
  currency: "NGN";
  /** Rows that met the floor. */
  byField: Band[];
  byCity: Band[];
  byExperience: Band[];
  /** Placements with a salary recorded, in total. */
  sampleSize: number;
  /** Groups withheld because they were too small, so the gap is explained. */
  withheld: number;
  minGroup: number;
  from: string | null;
  to: string | null;
  /** True when there is not yet enough data to publish anything at all. */
  empty: boolean;
};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** A group becomes a row only if it is big enough to hide an individual in. */
function fold(groups: Map<string, number[]>, minGroup: number): { rows: Band[]; withheld: number } {
  const rows: Band[] = [];
  let withheld = 0;
  for (const [label, values] of Array.from(groups.entries())) {
    if (values.length < minGroup) { withheld += 1; continue; }
    const sorted = [...values].sort((a, b) => a - b);
    rows.push({
      label,
      n: sorted.length,
      median: Math.round(quantile(sorted, 0.5)),
      p25: Math.round(quantile(sorted, 0.25)),
      p75: Math.round(quantile(sorted, 0.75))
    });
  }
  rows.sort((a, b) => b.median - a.median);
  return { rows, withheld };
}

function experienceBand(years: number | null | undefined): string {
  if (years == null) return "Not stated";
  if (years < 1) return "Under a year";
  if (years < 3) return "1 to 2 years";
  if (years < 6) return "3 to 5 years";
  if (years < 10) return "6 to 9 years";
  return "10 years or more";
}

/**
 * The whole benchmark in four queries.
 *
 * Read with the service role because placements and profiles are not readable
 * by a member, and the caller is responsible for checking that the viewer is
 * a verified Elite member before showing any of it.
 */
export async function salaryBenchmark(
  opts: { admin?: any; minGroup?: number } = {}
): Promise<Benchmark> {
  const admin = opts.admin ?? createAdminClient();
  // The suppression floor is injectable for one reason only: so a test can
  // prove that a group under the floor is withheld. It is never raised or
  // lowered at a call site in the application.
  /**
   * Five is a floor on the floor.
   *
   * The setting can raise the threshold and must not be able to lower it:
   * the page tells members that nothing is published below five placements,
   * and a settings row quietly holding 3 would make that sentence false and
   * publish a median over three salaries.
   */
  const FLOOR = 5;
  const minGroup = Math.max(FLOOR, Number(opts.minGroup ?? (await eliteSettings()).benchmark_min_group) || FLOOR);

  const empty: Benchmark = {
    currency: "NGN", byField: [], byCity: [], byExperience: [],
    sampleSize: 0, withheld: 0, minGroup, from: null, to: null, empty: true
  };

  /**
   * Only placements with a real monthly salary in naira.
   *
   * Mixing currencies would produce a median that means nothing, and
   * converting them would mean inventing an exchange rate for the day each
   * placement happened. Naira only, stated as such.
   */
  const { data: places } = await admin.from("placements")
    .select("talent_id, job_id, monthly_salary, currency, created_at, start_date")
    .not("monthly_salary", "is", null)
    .gt("monthly_salary", 0)
    .eq("currency", "NGN")
    .order("created_at", { ascending: true })
    .limit(5000);

  const rows = (places ?? []).filter((p: any) => Number(p.monthly_salary) > 0);
  if (!rows.length) return empty;

  const jobIds = Array.from(new Set(rows.map((r: any) => r.job_id).filter(Boolean)));
  const talentIds = Array.from(new Set(rows.map((r: any) => r.talent_id).filter(Boolean)));

  const [{ data: jobs }, { data: profiles }, { data: talents }] = await Promise.all([
    jobIds.length
      ? admin.from("jobs").select("id, niche_id, location").in("id", jobIds)
      : Promise.resolve({ data: [] as any[] }),
    talentIds.length
      ? admin.from("profiles").select("id, city, state").in("id", talentIds)
      : Promise.resolve({ data: [] as any[] }),
    talentIds.length
      ? admin.from("talent_profiles").select("profile_id, years_experience").in("profile_id", talentIds)
      : Promise.resolve({ data: [] as any[] })
  ]);

  const nicheIds = Array.from(new Set((jobs ?? []).map((j: any) => j.niche_id).filter(Boolean)));
  const { data: niches } = nicheIds.length
    ? await admin.from("taxonomies").select("id, label").in("id", nicheIds)
    : { data: [] as any[] };

  // Explicit types: the admin client is injectable for testing, so these
  // rows arrive untyped and the maps have to say what they hold.
  const nicheLabel = new Map<string, string>((niches ?? []).map((n: any) => [n.id, n.label]));
  const jobById = new Map<string, any>((jobs ?? []).map((j: any) => [j.id, j]));
  const profById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
  const yearsById = new Map<string, number | null>((talents ?? []).map((t: any) => [t.profile_id, t.years_experience]));

  const byField = new Map<string, number[]>();
  const byCity = new Map<string, number[]>();
  const byExp = new Map<string, number[]>();

  const push = (m: Map<string, number[]>, key: string | null | undefined, value: number) => {
    const k = (key ?? "").trim();
    if (!k) return;
    const list = m.get(k);
    if (list) list.push(value); else m.set(k, [value]);
  };

  for (const r of rows as any[]) {
    const salary = Number(r.monthly_salary);
    const job = r.job_id ? jobById.get(r.job_id) : null;
    const prof = r.talent_id ? profById.get(r.talent_id) : null;

    push(byField, job?.niche_id ? nicheLabel.get(job.niche_id) : null, salary);
    // The candidate's own city when it is known, and the role's location
    // otherwise. A guest placement has no profile, which is the usual reason
    // the first one is missing.
    push(byCity, prof?.city || job?.location || null, salary);
    push(byExp, experienceBand(r.talent_id ? yearsById.get(r.talent_id) : null), salary);
  }

  const f = fold(byField, minGroup);
  const c = fold(byCity, minGroup);
  const e = fold(byExp, minGroup);

  const dates = (rows as any[])
    .map((r) => r.start_date || r.created_at)
    .filter(Boolean)
    .sort();

  return {
    currency: "NGN",
    byField: f.rows, byCity: c.rows, byExperience: e.rows,
    sampleSize: rows.length,
    withheld: f.withheld + c.withheld + e.withheld,
    minGroup,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    empty: !f.rows.length && !c.rows.length && !e.rows.length
  };
}

/** Naira, grouped, no decimals. The way money is written on the platform. */
export function naira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}
