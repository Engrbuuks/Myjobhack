import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PricingCenter } from "@/components/PricingCenter";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const admin = createAdminClient();
  const [{ data: seekerPlans }, { data: employerPlans }, { data: pricingRow }] = await Promise.all([
    admin.from("plans").select("id, name, price_ngn, price_usd, interval, features, active, sort").order("sort"),
    admin.from("employer_plans").select("*").order("sort"),
    admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle()
  ]);

  return (
    <>
      <PageHeader
        title="Pricing"
        sub="Every price on the platform, in one place — member subscriptions, employer plans, assessments and Elite. Changes take effect immediately."
      />
      <PricingCenter
        seekerPlans={(seekerPlans ?? []) as any}
        employerPlans={(employerPlans ?? []) as any}
        loose={(pricingRow?.value ?? {}) as any}
      />
    </>
  );
}
