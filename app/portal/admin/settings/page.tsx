import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ToolLimits } from "@/components/ToolLimits";
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

  const { data: limitsRow } = await supabase.from("app_settings").select("value").eq("key", "toolkit_limits").maybeSingle();

  // fair-use watch: members whose reviews spanned 3+ DIFFERENT resumes in 7 days
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: reviewRuns } = await supabase.from("ai_runs")
    .select("profile_id, input").eq("tool", "resume_review").gte("created_at", weekAgo);
  const docSets = new Map<string, Set<string>>();
  (reviewRuns ?? []).forEach((r) => {
    const d = (r.input as any)?.resume_document_id;
    if (!d) return;
    if (!docSets.has(r.profile_id)) docSets.set(r.profile_id, new Set());
    docSets.get(r.profile_id)!.add(d);
  });
  const flaggedIds = Array.from(docSets.entries()).filter(([, s]) => s.size >= 3).map(([id]) => id);
  const { data: flaggedProfiles } = flaggedIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", flaggedIds)
    : { data: [] as any[] };

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
      <div className="mt-6 grid lg:grid-cols-2 gap-5">
        <ToolLimits limits={(limitsRow?.value as any) ?? {}} />
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1">Toolkit fair-use watch</div>
          <p className="text-xs text-muted-2 mb-4">Members whose Resume Reviews covered 3+ different resumes in the last 7 days — the signature of someone reviewing other people&rsquo;s CVs as a service.</p>
          {(flaggedProfiles ?? []).length === 0 ? (
            <p className="text-sm text-muted">All clear — every member is reviewing their own resume.</p>
          ) : (
            <div className="space-y-2">
              {(flaggedProfiles ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-coral/40 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{p.full_name}</div>
                    <div className="text-xs text-muted-2">{p.email} · {docSets.get(p.id)?.size} resumes this week</div>
                  </div>
                  <a href="/portal/admin/users" className="text-xs font-bold text-coral">Manage →</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
