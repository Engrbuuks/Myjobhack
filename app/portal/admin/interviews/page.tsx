import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { InterviewBoard } from "@/components/InterviewDesk";
import { assembleInterviewRows } from "@/lib/interviews";

/**
 * Every interview on the system, for staff.
 *
 * Read with the service-role client on purpose. The portal layout already
 * refuses anyone who is not admin or recruiter, so the gate is upstream, and
 * reading as the signed-in user meant row level security decided what showed.
 * An interview for a MYJOBHACK job has no org_id, so an org-scoped policy
 * returned nothing and the page looked empty while the rows were plainly in
 * the table. A list that silently omits records is worse than no list.
 */
export const dynamic = "force-dynamic";

export default async function AdminInterviews() {
  /**
   * Never serve this page from a cache.
   *
   * force-dynamic above stops it being rendered at build time; this stops the
   * rendered output being kept and handed out again. Twenty interviews were
   * scheduled and this page showed none of them, and deleted interviews
   * reappeared, because what was on screen had been rendered before either
   * change happened. A roster is only useful if it is current.
   */
  noStore();

  const admin = createAdminClient();
  const readAt = new Date();

  const { data: interviews, error } = await admin.from("interviews")
    .select("*")
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(2000);

  const rows = await assembleInterviewRows(admin as any, interviews ?? [], { portal: "admin" });

  // Only jobs that actually have interviews, so the filter is short and every
  // option returns something.
  const jobIds = Array.from(new Set(rows.map((r) => r.jobId).filter(Boolean)));
  const jobs = jobIds
    .map((id) => ({ id, title: rows.find((r) => r.jobId === id)!.jobTitle }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <PageHeader title="Interviews"
        sub="Everyone scheduled, singly or in bulk, with their CV and contact details. Scorecard outcomes move the application pipeline automatically." />

      {error && (
        <div className="card p-4 mb-5 border-coral text-sm">
          The interview list could not be read: {error.message}
        </div>
      )}

      <InterviewBoard rows={rows} jobs={jobs}
        readAt={readAt.toLocaleTimeString("en-GB", {
          timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", second: "2-digit"
        })} />
    </>
  );
}
