import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { BankSettings, TaxonomyManager } from "@/components/AdminSettings";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const [{ data: ngn }, { data: usd }, { data: taxonomies }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_ngn").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_usd").maybeSingle(),
    supabase.from("taxonomies").select("*").order("sort")
  ]);
  const empty = { bank: "", account_name: "", account_number: "" };

  return (
    <>
      <PageHeader title="Settings"
        sub="Bank details shown to subscribers, and the four CRM axes — deactivated options disappear from filters and the profile wizard, without touching anyone's existing profile." />
      <div className="mb-10">
        <BankSettings ngn={(ngn?.value as any) ?? empty} usd={(usd?.value as any) ?? empty} />
      </div>
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">CRM axes & sectors</div>
      <TaxonomyManager taxonomies={(taxonomies ?? []) as any} />
    </>
  );
}
