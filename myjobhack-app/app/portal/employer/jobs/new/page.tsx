import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { JobEditor } from "@/components/JobEditor";
import { getMyOrg } from "@/lib/org";

export default async function EmployerNewJob() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [org, { data: niches }] = await Promise.all([
    getMyOrg(supabase, user!.id),
    supabase.from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort")
  ]);
  if (!org) {
    return (
      <>
        <PageHeader title="Post a job" />
        <div className="card p-8 text-sm">Set up your <Link href="/portal/employer/company" className="text-coral font-semibold">company</Link> first.</div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Post a job" sub="Create the role, then shape its application form on the next screen." />
      <JobEditor job={null} niches={niches ?? []} orgId={org.id} basePath="/portal/employer/jobs" />
    </>
  );
}
