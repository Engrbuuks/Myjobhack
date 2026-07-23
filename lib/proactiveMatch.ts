import { createAdminClient } from "@/lib/supabase/admin";
import { rankCandidates } from "@/lib/matching";
import { sendEmail } from "@/lib/resend";
import { renderPlainEmail } from "@/lib/email";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

type MatchSettings = {
  notify_threshold: number;
  max_notifications_per_week: number;
  email_enabled: boolean;
};

async function settings(): Promise<MatchSettings> {
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "matching").maybeSingle();
  const v = (data?.value ?? {}) as any;
  return {
    notify_threshold: Number(v.notify_threshold) || 72,
    max_notifications_per_week: Number(v.max_notifications_per_week) || 2,
    email_enabled: v.email_enabled !== false
  };
}

/**
 * Match ONE job against the pool. Called when a job is published — this is the
 * cheap, high-value moment, because a new posting is the only thing that has
 * actually changed.
 */
export async function matchJobToPool(jobId: string): Promise<{ matched: number; error?: string }> {
  const admin = createAdminClient();

  const { data: job } = await admin.from("jobs")
    .select("id, title, description, location, work_mode, key_requirements, niche_id, role_level, status")
    .eq("id", jobId).maybeSingle();
  if (!job || job.status !== "published") return { matched: 0, error: "Job not published." };

  // Only consider people who could plausibly fit — assessed, in the right field.
  let q = admin.from("talent_profiles")
    .select("profile_id, headline, expected_role_level, years_experience, custom_skills, competency_band, competency_score, niche_id")
    .not("competency_band", "is", null);
  if (job.niche_id) q = q.eq("niche_id", job.niche_id);
  const { data: pool } = await q.limit(300);

  if (!pool?.length) return { matched: 0 };

  const ranked = await rankCandidates({
    job: {
      title: job.title, description: job.description ?? "", location: job.location ?? "",
      work_mode: job.work_mode ?? "", key_requirements: Array.isArray(job.key_requirements) ? job.key_requirements : [],
      niche_id: job.niche_id, role_level: job.role_level
    },
    candidates: pool.map((c: any) => ({
      talent_id: c.profile_id, headline: c.headline ?? "", role_level: c.expected_role_level,
      years: c.years_experience ?? 0, skills: Array.isArray(c.custom_skills) ? c.custom_skills : [],
      competency_band: c.competency_band, competency_score: c.competency_score, niche_id: c.niche_id
    }))
  });

  for (const r of ranked) {
    await admin.from("job_matches").upsert({
      job_id: jobId, talent_id: r.talent_id, score: r.score,
      reasons: r.reasons, competency_fit: r.competency_fit, computed_at: new Date().toISOString()
    }, { onConflict: "job_id,talent_id" });
  }
  return { matched: ranked.length };
}

/**
 * Notify seekers about strong matches they have not been told about.
 * Rate-limited so a match notification always means something.
 */
export async function notifyNewMatches(): Promise<{ notified: number; skipped: number }> {
  const admin = createAdminClient();
  const cfg = await settings();

  // Strong, unnotified matches on jobs that are still open.
  const { data: fresh } = await admin.from("job_matches")
    .select("id, job_id, talent_id, score, reasons")
    .is("notified_at", null)
    .gte("score", cfg.notify_threshold)
    .order("score", { ascending: false })
    .limit(500);

  if (!fresh?.length) return { notified: 0, skipped: 0 };

  // Group per seeker so one person gets one email about several roles.
  const byTalent = new Map<string, typeof fresh>();
  fresh.forEach((m: any) => {
    const arr = byTalent.get(m.talent_id) ?? [];
    arr.push(m); byTalent.set(m.talent_id, arr as any);
  });

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  let notified = 0, skipped = 0;

  for (const [talentId, matches] of Array.from(byTalent.entries())) {
    // Respect the weekly cap — over-notifying trains people to ignore us.
    const { count: recent } = await admin.from("job_matches")
      .select("id", { count: "exact", head: true })
      .eq("talent_id", talentId).gte("notified_at", weekAgo);
    if ((recent ?? 0) >= cfg.max_notifications_per_week) { skipped += matches.length; continue; }

    // Only include jobs that are still open and not already applied to.
    const jobIds = matches.map((m: any) => m.job_id);
    const { data: jobs } = await admin.from("jobs")
      .select("id, title, company_name, location, closes_at, status").in("id", jobIds).eq("status", "published");
    const { data: applied } = await admin.from("applications")
      .select("job_id").eq("talent_id", talentId).in("job_id", jobIds);
    const appliedIds = new Set((applied ?? []).map((a: any) => a.job_id));

    const live = (jobs ?? []).filter((j: any) =>
      !appliedIds.has(j.id) && (!j.closes_at || new Date(j.closes_at) > new Date()));
    if (!live.length) { skipped += matches.length; continue; }

    const { data: prof } = await admin.from("profiles")
      .select("full_name, email").eq("id", talentId).maybeSingle();

    // In-app notification always; email when enabled.
    await admin.from("notifications").insert({
      profile_id: talentId,
      title: live.length === 1 ? "A role matches your profile" : `${live.length} roles match your profile`,
      body: live.map((j: any) => j.title).slice(0, 3).join(" · "),
      link: "/portal/seeker/jobs"
    });

    if (cfg.email_enabled && prof?.email) {
      const first = (prof.full_name || "there").split(" ")[0];
      const html = renderPlainEmail({
        heading: live.length === 1
          ? "A role matches your profile"
          : `${live.length} roles match your profile`,
        paragraphs: [
          `Hi ${first},`,
          `Your competency band put you in front of ${live.length === 1 ? "a role" : "these roles"} we think genuinely fit. Matching is based on what you've proven you can do — not just keywords.`
        ],
        bullets: live.slice(0, 5).map((j: any) =>
          `${j.title}${j.company_name ? ` · ${j.company_name}` : ""}${j.location ? ` · ${j.location}` : ""}`),
        cta: { label: "See your matches", url: `${APP()}/portal/seeker/jobs` },
        signoff: "— The MYJOBHACK team",
        unsubscribeUrl: `${APP()}/portal/account`
      });
      await sendEmail(prof.email, live.length === 1
        ? `A role matches your profile`
        : `${live.length} roles match your profile`, html, { bulk: true });
    }

    // Mark only the ones we actually told them about.
    await admin.from("job_matches")
      .update({ notified_at: new Date().toISOString() })
      .eq("talent_id", talentId).in("job_id", live.map((j: any) => j.id));

    notified += live.length;
  }

  return { notified, skipped };
}

/**
 * Re-match seekers whose profile changed since we last matched them.
 *
 * COST NOTE — this is the expensive path, so it is built to be frugal:
 *  • We collect the DISTINCT jobs the dirty seekers collectively need, and run
 *    each job exactly ONCE. Matching a job scores the whole pool in a single AI
 *    call, so re-running per seeker would repeat identical work.
 *  • A hard ceiling caps the calls any single run can make.
 *  • Jobs already matched within the freshness window are skipped entirely.
 *
 * Result: a run costs at most `maxJobs` AI calls — not seekers × jobs.
 */
export async function rematchDirtySeekers(
  maxSeekers = 200,
  maxJobs = 25,
  freshnessHours = 20
): Promise<{ rematched: number; ai_calls: number; skipped_fresh: number }> {
  const admin = createAdminClient();

  const { data: dirty } = await admin.from("talent_profiles")
    .select("profile_id, niche_id").eq("match_dirty", true)
    .not("competency_band", "is", null).limit(maxSeekers);
  if (!dirty?.length) return { rematched: 0, ai_calls: 0, skipped_fresh: 0 };

  const nowIso = new Date().toISOString();

  // Which fields do these seekers sit in? Only those jobs can possibly match.
  const niches = Array.from(new Set(dirty.map((t: any) => t.niche_id).filter(Boolean)));

  let jq = admin.from("jobs").select("id, niche_id").eq("status", "published")
    .or(`closes_at.is.null,closes_at.gt.${nowIso}`);
  if (niches.length) jq = jq.in("niche_id", niches as string[]);
  const { data: jobs } = await jq.order("published_at", { ascending: false }).limit(maxJobs * 2);

  // Skip jobs matched recently — their results are still good.
  const freshCutoff = new Date(Date.now() - freshnessHours * 3600_000).toISOString();
  const candidateJobs = jobs ?? [];
  const jobIds = candidateJobs.map((j: any) => j.id);

  let recentlyMatched = new Set<string>();
  if (jobIds.length) {
    const { data: recent } = await admin.from("job_matches")
      .select("job_id").in("job_id", jobIds).gte("computed_at", freshCutoff);
    recentlyMatched = new Set((recent ?? []).map((r: any) => r.job_id));
  }

  const toMatch = candidateJobs
    .filter((j: any) => !recentlyMatched.has(j.id))
    .slice(0, maxJobs);                       // hard ceiling on AI calls

  // One AI call per job — scores the entire eligible pool each time.
  let calls = 0;
  for (const j of toMatch) {
    const r = await matchJobToPool(j.id);
    if (r.matched > 0) calls++;
  }

  // Clear the dirty flag for everyone in this batch.
  await admin.from("talent_profiles")
    .update({ match_dirty: false, last_matched_at: nowIso })
    .in("profile_id", dirty.map((t: any) => t.profile_id));

  return {
    rematched: dirty.length,
    ai_calls: calls,
    skipped_fresh: recentlyMatched.size
  };
}
