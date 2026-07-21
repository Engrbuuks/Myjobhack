import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ExperienceEditor } from "@/components/ExperienceEditor";

export const dynamic = "force-dynamic";

export default async function SeekerExperiencePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: rows } = await supabase.from("work_experiences")
    .select("id, title, company, employment_type, start_date, end_date, is_current, location, summary, sort")
    .eq("talent_id", user!.id).order("sort");

  return (
    <>
      <PageHeader title="Work experience"
        sub="This is what employers see on your profile card — before they ever open your résumé. The richer it is, the more you're evaluated on ability, not a document." />
      <ExperienceEditor initial={(rows ?? []) as any} />
    </>
  );
}
