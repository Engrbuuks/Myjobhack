import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

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
    overall, band, reviewer_id: user.id, reviewer_note: note ?? null,
    reviewed_at: new Date().toISOString()
  }).eq("id", score_id);

  // Publish/refresh the badge now that a human has confirmed it.
  const { data: asmt } = await admin.from("assessments").select("field_label").eq("id", score.assessment_id).maybeSingle();
  await admin.from("talent_profiles").update({
    competency_band: band, competency_score: overall, competency_percentile: score.percentile,
    competency_field: asmt?.field_label ?? null, competency_assessed_at: new Date().toISOString()
  }).eq("profile_id", score.talent_id);

  return NextResponse.json({ ok: true });
}
