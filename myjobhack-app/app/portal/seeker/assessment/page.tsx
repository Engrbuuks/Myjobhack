import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { AssessmentRunner } from "@/components/AssessmentRunner";

export const dynamic = "force-dynamic";

export default async function AssessmentPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tp } = await supabase.from("talent_profiles")
    .select("competency_band, competency_score, competency_percentile, competency_field, competency_assessed_at")
    .eq("profile_id", user.id).maybeSingle();

  const { data: recent } = await supabase.from("assessments")
    .select("id, field_label, status, created_at").eq("talent_id", user.id)
    .is("job_id", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  // Job-specific assessments an employer has ordered for this candidate.
  const { data: jobAsmts } = await supabase.from("assessments")
    .select("id, field_label, status, created_at, job_id, jobs(title, company_name)")
    .eq("talent_id", user.id).not("job_id", "is", null)
    .in("status", ["generated", "in_progress"])
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Prove your competency"
        sub="Take a short, practical assessment in your field. Employers search competency-assessed candidates first — this is how you get seen for what you can actually do."
      />
      {(jobAsmts ?? []).length > 0 && (
        <div className="card p-5 mb-6 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-display font-semibold text-lg mb-1">An employer wants to assess you for a role</div>
          <p className="text-sm text-muted-2 mb-4">You've been shortlisted. Complete the job-specific assessment below to move forward — this is tailored to that exact role.</p>
          <div className="space-y-2">
            {(jobAsmts ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{a.jobs?.title ?? a.field_label}{a.jobs?.company_name ? ` · ${a.jobs.company_name}` : ""}</div>
                  <div className="text-xs text-muted-2 capitalize">{a.status.replace("_", " ")}</div>
                </div>
                <a href={`/portal/seeker/assessment/${a.id}`} className="btn-coral !h-9 text-xs shrink-0">
                  {a.status === "in_progress" ? "Continue →" : "Start →"}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <AssessmentRunner
        current={tp?.competency_band ? {
          band: tp.competency_band, score: Number(tp.competency_score), field: tp.competency_field ?? "",
          percentile: tp.competency_percentile ?? undefined, assessed_at: tp.competency_assessed_at ?? undefined
        } : null}
        pendingId={recent && ["generated", "in_progress"].includes(recent.status) ? recent.id : null}
      />
    </>
  );
}
