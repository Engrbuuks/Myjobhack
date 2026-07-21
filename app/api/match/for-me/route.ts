import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankCandidates } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("talent_profiles")
    .select("headline, niche_id, expected_role_level, years_experience, custom_skills, competency_band, competency_score").eq("profile_id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ matches: [] });

  const { data: jobs } = await admin.from("jobs")
    .select("id, title, description, location, work_mode, key_requirements, niche_id, role_level, company_name")
    .eq("status", "published").limit(40);

  const cand = [{
    talent_id: user.id, headline: me.headline, niche_id: me.niche_id, role_level: me.expected_role_level,
    years: me.years_experience, skills: me.custom_skills, competency_band: me.competency_band, competency_score: me.competency_score
  }];

  // score this candidate against each job, keep the strong ones
  const scored = [];
  for (const j of jobs ?? []) {
    const [r] = await rankCandidates({ job: j as any, candidates: cand });
    if (r && r.score >= 55) scored.push({ job: j, score: r.score, reasons: r.reasons });
  }
  scored.sort((a, b) => b.score - a.score);

  return NextResponse.json({ matches: scored.slice(0, 10) });
}
