import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreAssessment, needsHumanReview } from "@/lib/assessment";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { assessment_id, answers } = await request.json();
  if (!assessment_id || !Array.isArray(answers))
    return NextResponse.json({ error: "assessment_id and answers required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: asmt } = await admin.from("assessments").select("*").eq("id", assessment_id).maybeSingle();
  if (!asmt || asmt.talent_id !== user.id) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (asmt.status === "scored") return NextResponse.json({ error: "Already submitted." }, { status: 400 });

  // Persist answers
  for (const a of answers) {
    await admin.from("assessment_answers").upsert({
      assessment_id, question_id: a.question_id, answer: String(a.answer ?? ""),
      seconds_spent: a.seconds_spent ?? null
    }, { onConflict: "assessment_id,question_id" });
  }
  await admin.from("assessments").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", assessment_id);

  // Score
  const result = await scoreAssessment({
    field: asmt.field_label, level: asmt.role_level ?? "mid",
    questions: asmt.questions as any, answers
  });

  const review = needsHumanReview(result);
  const percentile = await computePercentile(admin, asmt.field_label, asmt.role_level, result.overall);

  await admin.from("assessment_scores").insert({
    assessment_id, talent_id: user.id, overall: result.overall, percentile,
    band: result.band, per_question: result.per_question, strengths: result.strengths,
    gaps: result.gaps, ai_confidence: result.ai_confidence, scored_by: result.model ?? null,
    review_status: review ? "needs_review" : "auto", flags: result.flags
  });
  await admin.from("assessments").update({ status: "scored" }).eq("id", assessment_id);

  // Publish the badge to the profile ONLY when it doesn't need review.
  // (Expert/flagged/borderline wait for a human to confirm.)
  if (!review) {
    await publishBadge(admin, user.id, asmt.field_label, result.overall, result.band, percentile);
  }

  return NextResponse.json({
    ok: true,
    overall: result.overall, band: result.band, percentile,
    strengths: result.strengths, gaps: result.gaps,
    pending_review: review,
    message: review
      ? "Your assessment is complete and under final review — your badge will appear shortly."
      : "Your competency badge is live on your profile."
  });
}

async function computePercentile(admin: any, field: string, level: string | null, overall: number): Promise<number> {
  const { data } = await admin.from("assessment_scores")
    .select("overall, assessments!inner(field_label, role_level)")
    .eq("assessments.field_label", field);
  const peers = (data ?? []).map((r: any) => Number(r.overall));
  if (peers.length < 5) return 50; // not enough cohort yet
  const below = peers.filter((p: number) => p < overall).length;
  return Math.round((below / peers.length) * 100);
}

async function publishBadge(admin: any, talentId: string, field: string, score: number, band: string, percentile: number) {
  await admin.from("talent_profiles").update({
    competency_band: band, competency_score: score, competency_percentile: percentile,
    competency_field: field, competency_assessed_at: new Date().toISOString()
  }).eq("profile_id", talentId);
}
