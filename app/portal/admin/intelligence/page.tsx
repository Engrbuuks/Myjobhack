import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { IntelligenceBoard } from "@/components/IntelligenceBoard";
import { getIntelligence, DEFAULT_ASSUMPTIONS } from "@/lib/poolIntelligence";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Where the pool fails to convert, and what that costs.
 *
 * Pool Insights answers "what is in the pool". This answers "what should I do
 * about it" — grounded in jobs that went unfilled, requirements that rejected
 * people, and fees that were earned but never invoiced.
 */
export default async function IntelligencePage({
  searchParams
}: { searchParams: Record<string, string | undefined> }) {
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    training_fee: Number(searchParams.fee) || DEFAULT_ASSUMPTIONS.training_fee,
    placement_fee: Number(searchParams.placement) || DEFAULT_ASSUMPTIONS.placement_fee,
    take_rate: searchParams.take
      ? Math.min(1, Math.max(0, Number(searchParams.take) / 100))
      : DEFAULT_ASSUMPTIONS.take_rate
  };
  const windowDays = Number(searchParams.days) || 180;

  const data = await getIntelligence(assumptions, windowDays);
  /**
   * Niches with their talent counts, biggest first.
   *
   * Also counts how many of those people have an INDEXED CV, because coverage
   * is measured against indexed text — a niche with 200 members and nothing
   * indexed will read 0% for every skill and look like a catastrophe.
   */
  const adminDb = createAdminClient();
  const [{ data: nicheRows }, { data: talentRows }, { data: indexedRows }] = await Promise.all([
    adminDb.from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort"),
    adminDb.from("talent_profiles").select("profile_id, niche_id"),
    adminDb.from("resume_index").select("profile_id").not("profile_id", "is", null)
  ]);

  const indexedIds = new Set((indexedRows ?? []).map((r: any) => r.profile_id));
  const counts = new Map<string, { talent: number; indexed: number }>();
  for (const t of (talentRows ?? []) as any[]) {
    if (!t.niche_id) continue;
    const c = counts.get(t.niche_id) ?? { talent: 0, indexed: 0 };
    c.talent++;
    if (indexedIds.has(t.profile_id)) c.indexed++;
    counts.set(t.niche_id, c);
  }

  const niches = (nicheRows ?? []).map((n: any) => ({
    id: n.id, label: n.label,
    talent: counts.get(n.id)?.talent ?? 0,
    indexed: counts.get(n.id)?.indexed ?? 0
  })).sort((a, b) => b.talent - a.talent || a.label.localeCompare(b.label));

  return (
    <>
      <PageHeader
        title="Pool intelligence"
        sub="Where demand goes unserved, what to train, and what it is worth — read from your own jobs, applications and placements." />
      <Suspense fallback={<div className="card p-6 text-sm text-muted">Reading the pool…</div>}>
        <IntelligenceBoard data={data} />
      </Suspense>
      <div className="mt-8">
        <BenchmarkBoard niches={(niches ?? []) as any} />
      </div>
    </>
  );
}
