import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { CampaignComposer } from "@/components/CampaignComposer";
import { CampaignSchedule } from "@/components/CampaignSchedule";
import { dispatchDue } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = createClient();

  // opportunistic dispatcher: anything due fires the moment this desk opens
  try { await dispatchDue(createAdminClient()); } catch {}

  const [{ data: niches }, { data: campaigns }] = await Promise.all([
    supabase.from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort"),
    supabase.from("campaigns")
      .select("id, subject, audience, status, scheduled_at, sent_at, recipients, sent_count, error")
      .order("created_at", { ascending: false }).limit(30)
  ]);

  return (
    <>
      <PageHeader title="Marketing campaigns"
        sub="Give the AI your clues — it drafts in strict inverted-pyramid form. Send now, or schedule it and walk away." />
      <CampaignComposer niches={niches ?? []} />
      <CampaignSchedule campaigns={(campaigns ?? []) as any} />
    </>
  );
}
