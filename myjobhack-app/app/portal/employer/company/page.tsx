import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CompanySetup } from "@/components/CompanySetup";
import { getMyOrg } from "@/lib/org";

export default async function CompanyPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [org, { data: sectors }] = await Promise.all([
    getMyOrg(supabase, user!.id),
    supabase.from("taxonomies").select("id, label").eq("kind", "sector").eq("active", true).order("sort")
  ]);

  return (
    <>
      <PageHeader title={org ? "Company settings" : "Set up your company"}
        sub={org ? "Your company details as candidates see them." : "One minute of setup, then you can post your first role."} />
      <CompanySetup org={org} sectors={sectors ?? []} />
    </>
  );
}
