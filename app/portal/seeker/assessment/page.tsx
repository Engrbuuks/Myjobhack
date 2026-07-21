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
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  return (
    <>
      <PageHeader
        title="Prove your competency"
        sub="Take a short, practical assessment in your field. Employers search competency-assessed candidates first — this is how you get seen for what you can actually do."
      />
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
