import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SingleAssessmentRunner } from "@/components/SingleAssessmentRunner";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TakeAssessmentPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: a } = await supabase.from("assessments")
    .select("id, talent_id, status, field_label, job_id, jobs(title, company_name)")
    .eq("id", params.id).maybeSingle();
  if (!a || a.talent_id !== user.id) redirect("/portal/seeker/assessment");

  const roleLabel = (a as any).jobs?.title
    ? `${(a as any).jobs.title}${(a as any).jobs.company_name ? ` · ${(a as any).jobs.company_name}` : ""}`
    : a.field_label;

  return (
    <>
      <PageHeader title="Job-specific assessment"
        sub={`Tailored to: ${roleLabel}. Answer as fully as you can — this is your chance to prove you can do this exact role.`} />
      <SingleAssessmentRunner assessmentId={a.id}
        alreadyDone={!["generated", "in_progress"].includes(a.status)} />
    </>
  );
}
