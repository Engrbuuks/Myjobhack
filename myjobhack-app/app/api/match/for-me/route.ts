import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankCandidates } from "@/lib/matching";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A seeker's matches for their dashboard.
 *
 * Reads STORED matches first — proactive matching now populates job_matches
 * when a job is published, so this is usually instant and costs no AI spend.
 * Falls back to computing live only when nothing is stored yet.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // 1 · Stored matches (the fast path).
  const { data: stored } = await admin.from("job_matches")
    .select("job_id, score, reasons, competency_fit")
    .eq("talent_id", user.id).gte("score", 55)
    .order("score", { ascending: false }).limit(12);

  if (stored?.length) {
    const ids = stored.map((m: any) => m.job_id);
    const { data: jobs } = await admin.from("jobs")
      .select("id, title, company_name, location, work_mode, closes_at, status")
      .in("id", ids).eq("status", "published")
      .or(`closes_at.is.null,closes_at.gt.${nowIso}`);

    // Don't show roles they've already applied to.
    const { data: applied } = await admin.from("applications")
      .select("job_id").eq("talent_id", user.id).in("job_id", ids);
    const appliedIds = new Set((applied ?? []).map((a: any) => a.job_id));

    const jmap = new Map((jobs ?? []).map((j: any) => [j.id, j]));
    const matches = stored
      .filter((m: any) => jmap.has(m.job_id) && !appliedIds.has(m.job_id))
      .map((m: any) => ({ job: jmap.get(m.job_id), score: Math.round(m.score), reasons: m.reasons }));

    if (matches.length) {
      // Mark them seen so we don't re-notify about something already viewed.
      await admin.from("job_matches")
        .update({ seen_by_talent: true })
        .eq("talent_id", user.id).in("job_id", matches.map((m: any) => m.job.id));
      return NextResponse.json({ matches, source: "stored" });
    }
  }

  // 2 · Nothing stored — compute live so a new seeker isn't shown an empty page.
  const { data: me } = await admin.from("talent_profiles")
    .select("headline, niche_id, expected_role_level, years_experience, custom_skills, competency_band, competency_score")
    .eq("profile_id", user.id).maybeSingle();

  if (!me?.competency_band) {
    return NextResponse.json({
      matches: [],
      needs_assessment: true,
      note: "Take your competency assessment to start being matched to roles."
    });
  }

  // COST GUARD: this fallback runs one AI call per job, so it is capped hard
  // and narrowed to the seeker's own field. Most seekers never reach this path
  // because publishing a job already stored their matches.
  let jq = admin.from("jobs")
    .select("id, title, company_name, location, work_mode, description, key_requirements, niche_id, role_level")
    .eq("status", "published")
    .or(`closes_at.is.null,closes_at.gt.${nowIso}`);
  if (me.niche_id) jq = jq.eq("niche_id", me.niche_id);
  const { data: jobs } = await jq.order("published_at", { ascending: false }).limit(8);

  const scored: any[] = [];
  for (const j of jobs ?? []) {
    const ranked = await rankCandidates({
      job: {
        title: j.title, description: j.description ?? "", location: j.location ?? "",
        work_mode: j.work_mode ?? "",
        key_requirements: Array.isArray(j.key_requirements) ? j.key_requirements : [],
        niche_id: j.niche_id, role_level: j.role_level
      },
      candidates: [{
        talent_id: user.id, headline: me.headline ?? "", role_level: me.expected_role_level,
        years: me.years_experience ?? 0,
        skills: Array.isArray(me.custom_skills) ? me.custom_skills : [],
        competency_band: me.competency_band, competency_score: me.competency_score,
        niche_id: me.niche_id
      }]
    });
    const r = ranked[0];
    if (r && r.score >= 55) {
      scored.push({ job: j, score: r.score, reasons: r.reasons });
      // Store it so next time is instant.
      await admin.from("job_matches").upsert({
        job_id: j.id, talent_id: user.id, score: r.score,
        reasons: r.reasons, competency_fit: r.competency_fit, computed_at: nowIso
      }, { onConflict: "job_id,talent_id" });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return NextResponse.json({ matches: scored.slice(0, 12), source: "computed" });
}
