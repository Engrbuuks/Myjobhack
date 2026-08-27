import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { InterviewDesk } from "@/components/InterviewDesk";
import { assembleInterviewRows, splitUpcoming } from "@/lib/interviews";
import { getMyOrg } from "@/lib/org";

export default async function EmployerInterviews() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);
  if (!org) {
    return (
      <>
        <PageHeader title="Interviews" />
        <div className="card p-8 text-sm">Set up your <Link href="/portal/employer/company" className="text-coral font-semibold">company</Link> first.</div>
      </>
    );
  }
  const admin = createAdminClient();
  const { data: interviews } = await admin.from("interviews")
    .select("*").eq("org_id", org.id).order("scheduled_at", { ascending: true, nullsFirst: true });
  const rows = await assembleInterviewRows(admin as any, interviews ?? []);
  const { active, past } = splitUpcoming(rows);

  return (
    <>
      <PageHeader title="Interviews"
        sub="Your candidate meetings — schedule from any applicant list, score here, and let outcomes move the pipeline." />
      <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Active</div>
      <InterviewDesk rows={active} />
      {past.length > 0 && (
        <>
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3 mt-8">History</div>
          <InterviewDesk rows={past} />
        </>
      )}
    </>
  );
}
