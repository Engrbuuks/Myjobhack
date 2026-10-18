import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { rankCandidates } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Resolve caller authority over a job: 'staff' | 'org' | null. */
async function authority(admin: any, userId: string, jobOrgId: string | null, role: string | undefined) {
  if (role === "admin" || role === "recruiter") return "staff";
  if (!jobOrgId) return null;
  const { data: m } = await admin.from("org_members")
    .select("org_id").eq("org_id", jobOrgId).eq("profile_id", userId).maybeSingle();
  return m ? "org" : null;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id } = await request.json().catch(() => ({} as any));
  if (!job_id) return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  const admin = createAdminClient();

  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();

  const { data: job } = await admin.from("jobs")
    .select("id, title, description, location, work_mode, key_requirements, niche_id, role_level, org_id").eq("id", job_id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  /**
   * The role check alone was not authorisation.
   *
   * Registration lets a stranger pick the employer role, and job_id was never
   * checked against them, so any signed up account could rank the whole pool
   * against someone else's posting and read the names back. An employer must
   * belong to the organisation that owns the job; staff hold the pool
   * capability, which is the same thing the pool browser is gated on.
   */
  const auth = await authority(admin, user.id, job.org_id ?? null, me?.role);
  if (auth === "staff") {
    const perm = await requirePermission("pool.view");
    if (!perm.ok) return perm.response;
  } else if (auth !== "org") {
    return NextResponse.json({
      error: job.org_id
        ? "This job belongs to another organisation, so its matches are not yours to see."
        : "This job belongs to MYJOBHACK, so only staff can match candidates against it."
    }, { status: 403 });
  }

  // pull candidate pool (talent with a profile)
  const { data: tps } = await admin.from("talent_profiles")
    .select("profile_id, headline, niche_id, expected_role_level, years_experience, custom_skills, competency_band, competency_score");

  /**
   * Elite members come first. This is the perk the membership page has been
   * selling, and until now nothing in this route knew what an Elite member
   * was.
   *
   * Two separate things had to change, and the ordering was the smaller one.
   * The pool is cut to 300 candidates before ranking, and that cut was taken
   * from an unordered fetch, so a verified member could be dropped before
   * being considered at all. Elite members are moved to the front of the
   * pool first, so the people who were promised priority are never the ones
   * the limit discards.
   */
  const { data: eliteRows } = await admin.from("elite_memberships")
    .select("talent_id").eq("status", "verified");
  const elite = new Set((eliteRows ?? []).map((e: any) => e.talent_id));

  const pool = [...(tps ?? [])].sort((a: any, b: any) => {
    const ae = elite.has(a.profile_id) ? 1 : 0;
    const be = elite.has(b.profile_id) ? 1 : 0;
    return be - ae;
  });

  const ids = pool.map((t: any) => t.profile_id);
  const { data: profs } = await admin.from("profiles").select("id, country, state").in("id", ids.slice(0, 500));
  const geo = new Map((profs ?? []).map((p: any) => [p.id, p]));

  const candidates = pool.slice(0, 300).map((t: any) => ({
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

  /**
   * Verified members first, then by score inside each group.
   *
   * Deliberately two groups rather than a points bonus. A hidden boost would
   * mean an employer could not tell why one candidate outranked another, and
   * the copy promises that Elite members appear "above the general list",
   * which is a list, not a thumb on the scale. The flag travels with each
   * match so the interface can label the block and the employer can see
   * exactly what they are looking at.
   */
  const top = ranked
    .map((r) => ({ ...r, elite: elite.has(r.talent_id) }))
    .sort((a, b) => (a.elite === b.elite ? b.score - a.score : (a.elite ? -1 : 1)))
    .slice(0, 20);
  const { data: names } = await admin.from("profiles").select("id, full_name").in("id", top.map((t) => t.talent_id));
  const nameMap = new Map((names ?? []).map((n: any) => [n.id, n.full_name]));

  return NextResponse.json({
    ok: true,
    matches: top.map((t) => ({ ...t, name: nameMap.get(t.talent_id) ?? "Candidate" }))
  });
}
