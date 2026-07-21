import { geminiJson } from "@/lib/gemini";

/**
 * Job ↔ candidate matching.
 * A fast deterministic pre-filter (field, level, location, competency) narrows
 * the pool, then AI ranks the shortlist with reasons. Competency-assessed
 * candidates are weighted up — that's the platform's whole promise.
 */

export type MatchInput = {
  job: { title: string; description?: string; location?: string; work_mode?: string; key_requirements?: string[]; niche_id?: string | null; role_level?: string | null };
  candidates: {
    talent_id: string; headline?: string; niche_id?: string | null; role_level?: string | null;
    years?: number; skills?: string[]; competency_band?: string | null; competency_score?: number | null;
    country?: string; state?: string;
  }[];
};

const BAND_WEIGHT: Record<string, number> = { expert: 20, strong: 14, proficient: 8, developing: 3 };

/** Deterministic base score (0..60) before AI adds nuance. */
export function baseScore(job: MatchInput["job"], c: MatchInput["candidates"][0]): number {
  let s = 0;
  if (job.niche_id && c.niche_id && job.niche_id === c.niche_id) s += 20;
  if (job.role_level && c.role_level && job.role_level === c.role_level) s += 10;
  if (job.work_mode === "remote") s += 6; // remote fits anyone
  else if (job.location && c.state && job.location.toLowerCase().includes(c.state.toLowerCase())) s += 8;
  s += BAND_WEIGHT[c.competency_band ?? ""] ?? 0; // competency is the differentiator
  return Math.min(60, s);
}

/** AI ranks the pre-scored shortlist and adds reasons. Returns 0..100 + reasons. */
export async function rankCandidates(input: MatchInput): Promise<{ talent_id: string; score: number; reasons: string[]; competency_fit: boolean }[]> {
  // pre-score and keep the top ~15 for the (more expensive) AI pass
  const pre = input.candidates
    .map((c) => ({ c, base: baseScore(input.job, c) }))
    .sort((a, b) => b.base - a.base)
    .slice(0, 15);

  if (pre.length === 0) return [];

  const prompt = `You are matching candidates to a job. Score each 0-100 for genuine fit and give 1-2 short reasons.
Weight ACTUAL COMPETENCY (assessed band/score) heavily — this platform sells proven ability, not CVs.

JOB:
${JSON.stringify({ title: input.job.title, requirements: input.job.key_requirements, level: input.job.role_level, mode: input.job.work_mode, location: input.job.location }, null, 1)}

CANDIDATES (with pre-computed base score for reference):
${JSON.stringify(pre.map(({ c, base }) => ({ talent_id: c.talent_id, headline: c.headline, level: c.role_level, years: c.years, skills: c.skills, competency: c.competency_band, competency_score: c.competency_score, base })), null, 1)}

Return ONLY JSON:
{"ranked":[{"talent_id":"..","score":0..100,"reasons":[".."],"competency_fit":true/false}]}`;

  const { data, error } = await geminiJson(prompt);
  if (error || !data?.ranked) {
    // fall back to base score alone
    return pre.map(({ c, base }) => ({ talent_id: c.talent_id, score: Math.round(base * 1.4), reasons: ["Profile match"], competency_fit: !!c.competency_band }));
  }
  return (data.ranked as any[]).map((r) => ({
    talent_id: String(r.talent_id),
    score: Math.min(100, Math.max(0, Number(r.score) || 0)),
    reasons: (r.reasons ?? []).map(String).slice(0, 3),
    competency_fit: !!r.competency_fit
  }));
}
