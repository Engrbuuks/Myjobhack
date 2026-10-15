import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { notifyBandDecision } from "@/lib/assessmentNotify";

export const runtime = "nodejs";

/**
 * Records the outcome of a LIVE verification — a short call where the candidate
 * explains their own answers. This is the strongest defence against AI-assisted
 * cheating: someone who did not do the work cannot discuss it.
 *
 * passed  → the band stands and is marked human-verified.
 * failed  → the score is withdrawn and the badge removed from the profile.
 */
export async function POST(request: Request) {
  /**
   * Behind the capability rather than an admin/recruiter role test, for the
   * same reason as the review desk: this decides whether a competency band
   * stands or is taken off someone's profile.
   */
  const gate = await requirePermission("assessments.manage");
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();

  const { score_id, outcome, notes } = await request.json();
  if (!["requested", "passed", "failed"].includes(outcome))
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });

  const { data: score } = await admin.from("assessment_scores")
    .select("id, talent_id, band, overall, percentile, assessment_id")
    .eq("id", score_id).maybeSingle();
  if (!score) return NextResponse.json({ error: "Score not found" }, { status: 404 });

  await admin.from("assessment_scores").update({
    verification_status: outcome,
    verified_by: outcome === "requested" ? null : gate.userId,
    verified_at: outcome === "requested" ? null : new Date().toISOString(),
    verification_notes: notes ?? null,
    ...(outcome === "passed" ? { review_status: "confirmed" } : {}),
    ...(outcome === "failed" ? { review_status: "overridden" } : {})
  }).eq("id", score_id);

  // A failed verification withdraws the band from the public profile.
  if (outcome === "failed") {
    await admin.from("talent_profiles")
      .update({ competency_band: null, competency_score: null })
      .eq("profile_id", score.talent_id);
  }

  await admin.from("activity_log").insert({
    actor_id: gate.userId,
    action: `Assessment verification ${outcome}`,
    entity: "assessment_score", entity_id: score_id
  });

  /**
   * Both of these change what the candidate's profile says about them, so both
   * are told. "requested" is left silent on purpose: it only queues them for a
   * call, and announcing a call nobody has arranged yet is a promise the
   * platform cannot keep.
   */
  let told: { notified: boolean; emailed: boolean; error: string | null } | null = null;
  if (outcome === "passed" || outcome === "failed") {
    const { data: asmt } = await admin.from("assessments")
      .select("field_label").eq("id", score.assessment_id).maybeSingle();
    told = await notifyBandDecision({
      admin, talentId: score.talent_id,
      field: asmt?.field_label ?? "",
      band: outcome === "passed" ? score.band : null,
      score: outcome === "passed" ? Number(score.overall) : null,
      event: outcome === "passed" ? "verified" : "withdrawn",
      note: notes ?? null, reviewerId: gate.userId
    });
  }

  const tail = !told
    ? ""
    : told.emailed
      ? " The candidate has been emailed."
      : ` The candidate was not emailed${told.error ? ` (${told.error})` : ""}.${
          told.notified ? " They will see it in the portal when they next sign in." : ""
        }`;

  return NextResponse.json({
    ok: true,
    notified: told?.notified ?? false,
    emailed: told?.emailed ?? false,
    message: (outcome === "passed"
      ? "Verified. The band stands and is now marked human-verified."
      : outcome === "failed"
        ? "Verification failed. The competency band has been withdrawn from this profile."
        : "Verification requested — this candidate is queued for a live check.") + tail
  });
}
