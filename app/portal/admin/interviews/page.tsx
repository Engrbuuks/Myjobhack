import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { InterviewDesk } from "@/components/InterviewDesk";
import { assembleInterviewRows, splitUpcoming } from "@/lib/interviews";

export default async function AdminInterviews() {
  const supabase = createClient();
  const { data: interviews } = await supabase.from("interviews")
    .select("*").order("scheduled_at", { ascending: true, nullsFirst: true });
  const rows = await assembleInterviewRows(supabase as any, interviews ?? []);
  const { active, past } = splitUpcoming(rows);

  return (
    <>
      <PageHeader title="Interviews"
        sub="Invitations, schedules, competency scorecards, and outcomes — outcomes drive the application pipeline automatically." />
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
