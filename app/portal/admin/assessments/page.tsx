import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { AssessmentReview } from "@/components/AssessmentReview";

export const dynamic = "force-dynamic";

export default async function AdminAssessmentsPage() {
  const admin = createAdminClient();
  const { data: queue } = await admin.from("assessment_scores")
    .select("id, talent_id, overall, band, percentile, strengths, gaps, ai_confidence, flags, review_status, per_question, assessment_id, created_at")
    .eq("review_status", "needs_review").order("created_at", { ascending: true });

  // hydrate names + field + answers
  const rows = [];
  for (const s of queue ?? []) {
    const { data: p } = await admin.from("profiles").select("full_name, email").eq("id", s.talent_id).maybeSingle();
    const { data: a } = await admin.from("assessments").select("field_label, questions").eq("id", s.assessment_id).maybeSingle();
    const { data: ans } = await admin.from("assessment_answers").select("question_id, answer, seconds_spent").eq("assessment_id", s.assessment_id);
    rows.push({ ...s, name: p?.full_name ?? "—", email: p?.email ?? "", field: a?.field_label ?? "", questions: a?.questions ?? [], answers: ans ?? [] });
  }

  return (
    <>
      <PageHeader
        title="Assessment review"
        sub="These results need a human decision — top badges, borderline passes, low-confidence AI grades, or integrity flags. Confirm or override each."
      />
      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">Nothing waiting for review. AI is handling the rest automatically.</div>
      ) : (
        <div className="space-y-4">{rows.map((r: any) => <AssessmentReview key={r.id} row={r} />)}</div>
      )}
    </>
  );
}
