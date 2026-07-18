import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";

export default async function SubscriptionPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: plans }, { data: subs }, { data: bankNgn }, { data: bankUsd }] = await Promise.all([
    supabase.from("plans").select("*").eq("active", true).order("sort", { ascending: false }),
    supabase.from("subscriptions").select("plan_id, status, current_period_end")
      .eq("profile_id", user!.id).eq("status", "active")
      .gt("current_period_end", new Date().toISOString()),
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_ngn").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_usd").maybeSingle()
  ]);

  const activePlanIds = (subs ?? []).map((s) => s.plan_id).filter(Boolean) as string[];
  const ends = new Map((subs ?? []).map((s) => [s.plan_id, s.current_period_end]));

  return (
    <>
      <PageHeader
        title="Career Toolkit"
        sub="Precision instruments for the job hunt — unlock the full toolkit, or just the tool you need. Every plan runs 30 days."
      />
      <SubscriptionPanel
        plans={(plans ?? []).map((p) => ({
          id: p.id, name: p.name, price_ngn: p.price_ngn, price_usd: p.price_usd,
          features: (p.features as string[]) ?? [], tools: p.tools as string[] | null,
          activeUntil: activePlanIds.includes(p.id) ? (ends.get(p.id) as string) : null
        }))}
        bankNgn={(bankNgn?.value as any) ?? null}
        bankUsd={(bankUsd?.value as any) ?? null}
      />
    </>
  );
}
