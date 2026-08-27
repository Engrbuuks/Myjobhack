import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { score_id, outcome, notes } = await request.json();
  if (!["requested", "passed", "failed"].includes(outcome))
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });

  const { data: score } = await admin.from("assessment_scores")
    .select("id, talent_id, band, overall, percentile, assessment_id")
    .eq("id", score_id).maybeSingle();
  if (!score) return NextResponse.json({ error: "Score not found" }, { status: 404 });

  await admin.from("assessment_scores").update({
    verification_status: outcome,
    verified_by: outcome === "requested" ? null : user.id,
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
    actor_id: user.id,
    action: `Assessment verification ${outcome}`,
    entity: "assessment_score", entity_id: score_id
  });

  return NextResponse.json({
    ok: true,
    message: outcome === "passed"
      ? "Verified. The band stands and is now marked human-verified."
      : outcome === "failed"
        ? "Verification failed. The competency band has been withdrawn from this profile."
        : "Verification requested — this candidate is queued for a live check."
  });
}
