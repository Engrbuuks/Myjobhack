import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankCandidates } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id } = await request.json();
  const admin = createAdminClient();

  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const staffOrEmployer = ["admin", "recruiter", "employer"].includes(me?.role ?? "");
  if (!staffOrEmployer) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { data: job } = await admin.from("jobs")
    .select("id, title, description, location, work_mode, key_requirements, niche_id, role_level").eq("id", job_id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // pull candidate pool (talent with a profile)
  const { data: tps } = await admin.from("talent_profiles")
    .select("profile_id, headline, niche_id, expected_role_level, years_experience, custom_skills, competency_band, competency_score");
  const ids = (tps ?? []).map((t: any) => t.profile_id);
  const { data: profs } = await admin.from("profiles").select("id, country, state").in("id", ids.slice(0, 500));
  const geo = new Map((profs ?? []).map((p: any) => [p.id, p]));

  const candidates = (tps ?? []).slice(0, 300).map((t: any) => ({
    talent_id: t.profile_id, headline: t.headline, niche_id: t.niche_id,
    role_level: t.expected_role_level, years: t.years_experience, skills: t.custom_skills,
    competency_band: t.competency_band, competency_score: t.competency_score,
    country: geo.get(t.profile_id)?.country, state: geo.get(t.profile_id)?.state
  }));

  const ranked = await rankCandidates({ job: job as any, candidates });

  // cache
  for (const r of ranked) {
    await admin.from("job_matches").upsert({
      job_id, talent_id: r.talent_id, score: r.score, reasons: r.reasons, competency_fit: r.competency_fit
    }, { onConflict: "job_id,talent_id" });
  }

  // hydrate names for display
  const top = ranked.sort((a, b) => b.score - a.score).slice(0, 20);
  const { data: names } = await admin.from("profiles").select("id, full_name").in("id", top.map((t) => t.talent_id));
  const nameMap = new Map((names ?? []).map((n: any) => [n.id, n.full_name]));

  return NextResponse.json({
    ok: true,
    matches: top.map((t) => ({ ...t, name: nameMap.get(t.talent_id) ?? "Candidate" }))
  });
}
