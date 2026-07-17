import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { JobEditor } from "@/components/JobEditor";

export default async function NewJob() {
  const supabase = createClient();
  const { data: niches } = await supabase
    .from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort");
  return (
    <>
      <PageHeader title="Post a job" sub="Create the role, then attach a custom application form on the next screen." />
      <JobEditor job={null} niches={niches ?? []} />
    </>
  );
}
