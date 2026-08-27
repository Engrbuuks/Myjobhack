import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Records a 30/60/90 check-in. This is the cheapest, highest-leverage thing we
 * do: most early attrition is an onboarding problem caught too late.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { checkin_id, still_employed, employer_rating, talent_sentiment,
          employer_notes, talent_notes, risk_flag } = await request.json();

  const { data: ci } = await admin.from("placement_checkins")
    .select("id, placement_id, day_marker").eq("id", checkin_id).maybeSingle();
  if (!ci) return NextResponse.json({ error: "Check-in not found." }, { status: 404 });

  const { error } = await admin.from("placement_checkins").update({
    still_employed, employer_rating: employer_rating || null,
    talent_sentiment: talent_sentiment || null,
    employer_notes: employer_notes || null, talent_notes: talent_notes || null,
    risk_flag: !!risk_flag,
    completed_at: new Date().toISOString(), completed_by: user.id
  }).eq("id", checkin_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Move the placement's retention status to match what we just learned.
  let status: string | null = null;
  if (still_employed === false) status = "left_early";
  else if (still_employed === true) {
    status = ci.day_marker >= 90 ? "retained_90" : ci.day_marker >= 60 ? "retained_60" : "retained_30";
  }
  if (status) {
    const patch: any = { retention_status: status };
    if (status === "left_early") patch.left_at = new Date().toISOString().slice(0, 10);
    if (employer_rating) patch.performance_rating = employer_rating;
    await admin.from("placements").update(patch).eq("id", ci.placement_id);
  }

  return NextResponse.json({
    ok: true,
    message: still_employed === false
      ? "Recorded as left early. If inside the guarantee window, a free replacement is owed."
      : `Day ${ci.day_marker} check-in recorded.`
  });
}
