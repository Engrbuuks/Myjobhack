import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function EmployerTalentPage() {
  return (
    <>
      <PageHeader
        title="Search the talent pool"
        sub="Every candidate is competency-assessed. Pick a job to see your best-matched, verified candidates ranked by proven fit."
      />
      <div className="card p-6 max-w-2xl">
        <p className="text-sm text-muted-2 mb-4">Open any of your jobs and use <b>Find matches</b> to see ranked candidates. Viewing a candidate's full profile uses one of your monthly views.</p>
        <a href="/portal/employer/jobs" className="btn-coral">Go to my jobs →</a>
      </div>
    </>
  );
}
