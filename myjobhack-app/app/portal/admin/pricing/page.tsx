import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PricingCenter } from "@/components/PricingCenter";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const admin = createAdminClient();
  // Each query is independent so a missing table (pending migration) can't blank the whole page.
  const seekerPlans = (await admin.from("plans").select("id, name, price_ngn, price_usd, interval, features, active, sort").order("sort")).data ?? [];
  const employerRes = await admin.from("employer_plans").select("*").order("sort");
  const employerPlans = employerRes.data ?? [];
  const employerMissing = !!employerRes.error;
  const trainings = (await admin.from("trainings").select("id, title, price_ngn, price_usd").order("created_at", { ascending: false })).data ?? [];
  const pricingRes = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
  const looseMissing = !pricingRes.data;

  return (
    <>
      <PageHeader
        title="Pricing"
        sub="Every price on the platform, in one place — member subscriptions, employer plans, assessments and Elite. Changes take effect immediately."
      />
      {(employerMissing || looseMissing) && (
        <div className="card p-4 mb-6 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink">Some pricing tables aren't set up yet</div>
          <p className="text-sm text-muted-2 mt-1">
            {employerMissing && "Employer plans need migration 0025. "}
            {looseMissing && "Assessment/Elite prices need migration 0026. "}
            Run the pending migrations in Supabase, then refresh — the fields below will fill in.
          </p>
        </div>
      )}
      <PricingCenter
        seekerPlans={seekerPlans as any}
        employerPlans={employerPlans as any}
        trainings={trainings as any}
        loose={(pricingRes.data?.value ?? {}) as any}
      />
    </>
  );
}
