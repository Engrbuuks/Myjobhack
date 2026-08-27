import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Assembles a STRUCTURED candidate profile for employer viewing — everything
 * needed to evaluate, WITHOUT any contact details. This is the leak-proof
 * replacement for showing a raw résumé pre-unlock.
 *
 * `released` (employer has unlocked or placed) controls whether identifying
 * fields (full name, résumé link) are included.
 */
export type CandidateCard = {
  talent_id: string;
  display_name: string;        // full name if released, else "First N." style
  headline: string | null;
  summary: string | null;
  years_experience: number;
  niche: string | null;
  role_level: string | null;
  work_mode: string | null;
  competency_band: string | null;
  competency_score: number | null;
  assessment_integrity: "clean" | "reviewed" | "flagged" | null;  // what the employer sees
  assessment_reviewed_by_human: boolean;
  skills: string[];
  experience: { title: string; company: string; period: string; summary: string | null }[];
  credentials: { title: string; institution: string; year: number | null; distinction: string | null; status: string }[];
  is_elite: boolean;
  released: boolean;
  resume_url: string | null;   // only when released
};

function periodOf(start: string | null, end: string | null, current: boolean): string {
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
  if (!start && !end) return "";
  return `${fmt(start)} — ${current ? "Present" : fmt(end)}`;
}

function firstNameMask(full: string | null): string {
  if (!full) return "Candidate";
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

export async function buildCandidateCard(talentId: string, released: boolean): Promise<CandidateCard | null> {
  const admin = createAdminClient();

  const { data: prof } = await admin.from("profiles").select("full_name").eq("id", talentId).maybeSingle();
  const { data: tp } = await admin.from("talent_profiles")
    .select("headline, summary, years_experience, niche_id, expected_role_level, preferred_work_mode, competency_band, competency_score, custom_skills")
    .eq("profile_id", talentId).maybeSingle();
  if (!tp) return null;

  // niche label
  let niche: string | null = null;
  if (tp.niche_id) {
    const { data: tax } = await admin.from("taxonomies").select("label").eq("id", tp.niche_id).maybeSingle();
    niche = tax?.label ?? null;
  }
  // skills: taxonomy expertise + custom
  const { data: exp } = await admin.from("talent_expertise").select("taxonomy_id").eq("talent_id", talentId);
  let taxSkills: string[] = [];
  if (exp?.length) {
    const ids = exp.map((e: any) => e.taxonomy_id);
    const { data: labels } = await admin.from("taxonomies").select("label").in("id", ids);
    taxSkills = (labels ?? []).map((l: any) => l.label);
  }
  const customSkills: string[] = Array.isArray(tp.custom_skills) ? tp.custom_skills : [];
  const skills = Array.from(new Set([...taxSkills, ...customSkills])).filter(Boolean);

  // work experience
  const { data: work } = await admin.from("work_experiences")
    .select("title, company, start_date, end_date, is_current, summary").eq("talent_id", talentId).order("sort");
  const experience = (work ?? []).map((w: any) => ({
    title: w.title, company: w.company, period: periodOf(w.start_date, w.end_date, w.is_current), summary: w.summary
  }));

  // credentials (title/institution shown; documents stay gated)
  const { data: creds } = await admin.from("credentials")
    .select("title, institution, year, distinction, status").eq("talent_id", talentId);
  const credentials = (creds ?? []).map((c: any) => ({
    title: c.title, institution: c.institution, year: c.year, distinction: c.distinction, status: c.status
  }));

  // Assessment integrity — employers paying real money deserve to know whether
  // the competency band came from a clean sitting or a flagged one.
  const { data: score } = await admin.from("assessment_scores")
    .select("integrity_risk, review_status")
    .eq("talent_id", talentId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  let assessmentIntegrity: "clean" | "reviewed" | "flagged" | null = null;
  const humanReviewed = score?.review_status === "confirmed" || score?.review_status === "overridden";
  if (score) {
    if (score.integrity_risk === "high") assessmentIntegrity = "flagged";
    else if (humanReviewed) assessmentIntegrity = "reviewed";
    else if (score.integrity_risk === "low") assessmentIntegrity = "clean";
    else assessmentIntegrity = "reviewed";
  }

  // elite?
  const { data: elite } = await admin.from("elite_memberships")
    .select("id").eq("talent_id", talentId).eq("status", "verified").maybeSingle();

  return {
    talent_id: talentId,
    display_name: released ? (prof?.full_name ?? "Candidate") : firstNameMask(prof?.full_name),
    headline: tp.headline, summary: tp.summary, years_experience: tp.years_experience ?? 0,
    niche, role_level: tp.expected_role_level, work_mode: tp.preferred_work_mode,
    competency_band: tp.competency_band ?? null, competency_score: tp.competency_score ?? null,
    assessment_integrity: assessmentIntegrity, assessment_reviewed_by_human: humanReviewed,
    skills, experience, credentials,
    is_elite: !!elite, released,
    resume_url: released ? `/api/employer/resume?talent_id=${talentId}` : null
  };
}
