import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { notifyBandDecision } from "@/lib/assessmentNotify";

export const runtime = "nodejs";

export async function POST(request: Request) {
  /**
   * Behind the capability rather than an admin/recruiter role test.
   *
   * The ad hoc check let every recruiter publish or override a competency
   * band, which is the number employers rank candidates by. Scoring is what
   * assessments.manage exists to gate.
   */
  const gate = await requirePermission("assessments.manage");
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();

  const { score_id, action, override_overall, override_band, note } = await request.json();
  const { data: score } = await admin.from("assessment_scores").select("*").eq("id", score_id).maybeSingle();
  if (!score) return NextResponse.json({ error: "Score not found" }, { status: 404 });

  let overall = Number(score.overall);
  let band = score.band;
  if (action === "override") {
    if (override_overall != null) overall = Number(override_overall);
    if (override_band) band = override_band;
  }

  await admin.from("assessment_scores").update({
    review_status: action === "override" ? "overridden" : "confirmed",
    overall, band, reviewer_id: gate.userId, reviewer_note: note ?? null,
    reviewed_at: new Date().toISOString()
  }).eq("id", score_id);

  // Publish/refresh the badge now that a human has confirmed it.
  const { data: asmt } = await admin.from("assessments").select("field_label").eq("id", score.assessment_id).maybeSingle();
  await admin.from("talent_profiles").update({
    competency_band: band, competency_score: overall, competency_percentile: score.percentile,
    competency_field: asmt?.field_label ?? null, competency_assessed_at: new Date().toISOString()
  }).eq("profile_id", score.talent_id);

  /**
   * Tell the candidate the band is live.
   *
   * Submitting promised the badge would appear shortly. Publishing it sent
   * nothing, so the only way to find out was to keep checking the page.
   */
  const told = await notifyBandDecision({
    admin, talentId: score.talent_id,
    field: asmt?.field_label ?? "",
    band, score: overall,
    event: action === "override" ? "overridden" : "confirmed",
    note: note ?? null, reviewerId: gate.userId
  });

  return NextResponse.json({
    ok: true,
    notified: told.notified, emailed: told.emailed,
    // The band is published either way, so say plainly whether they know.
    message: told.emailed
      ? "Published, and the candidate has been emailed."
      : `Published, but the candidate was not emailed${told.error ? ` (${told.error})` : ""}.${
          told.notified ? " They will see it in the portal when they next sign in." : ""
        }`
  });
}
