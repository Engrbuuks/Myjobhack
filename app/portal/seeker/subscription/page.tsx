import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";

export default async function SubscriptionPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: plan }, { data: sub }, { data: bankNgn }, { data: bankUsd }] = await Promise.all([
    supabase.from("plans").select("*").eq("active", true).limit(1).single(),
    supabase.from("subscriptions").select("status, current_period_end")
      .eq("profile_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_ngn").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_usd").maybeSingle()
  ]);

  return (
    <>
      <PageHeader
        title="AI Career Toolkit"
        sub="One subscription unlocks every AI tool — the current three and everything we add next."
      />
      <SubscriptionPanel
        plan={{
          name: plan?.name ?? "AI Career Toolkit",
          price_ngn: plan?.price_ngn ?? 5000,
          price_usd: plan?.price_usd ?? 10,
          features: (plan?.features as string[]) ?? []
        }}
        status={sub?.status ?? null}
        periodEnd={sub?.current_period_end ?? null}
        bankNgn={(bankNgn?.value as any) ?? null}
        bankUsd={(bankUsd?.value as any) ?? null}
      />
    </>
  );
}
