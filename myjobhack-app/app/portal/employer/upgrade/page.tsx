import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { EmployerPlans } from "@/components/EmployerPlans";

export const dynamic = "force-dynamic";

export default async function EmployerUpgradePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data: plans } = await admin.from("employer_plans").select("*").eq("active", true).order("sort");
  const { data: sub } = await admin.from("employer_subscriptions")
    .select("plan_id, status, views_used, period_end").eq("profile_id", user!.id).eq("status", "active").maybeSingle();

  return (
    <>
      <PageHeader
        title="Hire from a proven pool"
        sub="Every candidate is competency-assessed — you see what they can actually do before you spend a minute interviewing. Choose the access that fits your hiring."
      />
      <EmployerPlans plans={plans ?? []} currentPlanId={sub?.plan_id ?? null} />
    </>
  );
}
