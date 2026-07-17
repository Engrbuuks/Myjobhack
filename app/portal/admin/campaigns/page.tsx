import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CampaignComposer } from "@/components/CampaignComposer";

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: niches } = await supabase.from("taxonomies")
    .select("id, label").eq("kind", "niche").eq("active", true).order("sort");
  return (
    <>
      <PageHeader title="Marketing campaigns"
        sub="Give the AI your clues — it drafts in strict inverted-pyramid form: hook, immediate value in skimmable bullets, one CTA. Edit, test on yourself, then send." />
      <CampaignComposer niches={niches ?? []} />
    </>
  );
}
