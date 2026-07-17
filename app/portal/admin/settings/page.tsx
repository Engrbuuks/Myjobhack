import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { BankSettings, TaxonomyManager, ChapterManager, PlanManager } from "@/components/AdminSettings";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const [{ data: ngn }, { data: usd }, { data: taxonomies }, { data: chapters }, { data: plans }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_ngn").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "bank_transfer_usd").maybeSingle(),
    supabase.from("taxonomies").select("*").order("sort"),
    supabase.from("chapters").select("id, city, country, active").order("city"),
    supabase.from("plans").select("id, name, price_ngn, price_usd, active").order("created_at")
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
      <div className="mb-10"><TaxonomyManager taxonomies={(taxonomies ?? []) as any} /></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <ChapterManager chapters={(chapters ?? []) as any} />
        <PlanManager plans={(plans ?? []) as any} />
      </div>
    </>
  );
}
