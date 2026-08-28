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
  const { data: niches } = await createAdminClient()
    .from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort");

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
