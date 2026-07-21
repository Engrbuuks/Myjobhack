import { geminiJson } from "@/lib/gemini";

/**
 * Competency assessment engine.
 * Generates field-specific assessments from a candidate's own title/field/level,
 * and scores open-ended work against a rubric with a confidence signal that
 * routes low-confidence or high-stakes results to human review.
 */

export type AsmtQuestion = {
  id: string;
  type: "mcq" | "open" | "code";
  prompt: string;
  options?: string[];       // for mcq
  rubric: string;           // what a strong answer contains
  max_points: number;
  minutes: number;
};

export async function generateAssessment(opts: {
  field: string; level: string; skills: string[];
}): Promise<{ questions: AsmtQuestion[]; time_limit_min: number; model?: string; error?: string }> {
  const skills = opts.skills.filter(Boolean).slice(0, 8).join(", ");
  const prompt = `You are a hiring assessor creating a COMPETENCY test for a candidate.
Field/title: "${opts.field}"
Seniority: "${opts.level || "mid"}"
Declared skills: ${skills || "n/a"}

Create a practical assessment that measures whether this person can actually DO this job — not their credentials. Mix question types:
- 2 multiple-choice questions on core knowledge (type "mcq", include 4 "options")
- 2 open-response questions requiring real reasoning or a short work sample (type "open")
- If the field is technical/coding, 1 "code" question with a concrete task.

For EACH question include a concise "rubric" describing what a strong answer contains, "max_points" (10-25), and "minutes" (3-15).
Keep it realistic for the seniority. Total time should be 30-50 minutes.

Return ONLY JSON:
{"time_limit_min": <int>, "questions": [{"id":"q1","type":"mcq","prompt":"...","options":[".."],"rubric":"..","max_points":10,"minutes":4}, ...]}`;

  const { data, error, model } = await geminiJson(prompt);
  if (error || !data?.questions?.length) return { questions: [], time_limit_min: 45, error: error ?? "No questions generated" };

  const questions: AsmtQuestion[] = data.questions.map((q: any, i: number) => ({
    id: q.id || `q${i + 1}`,
    type: ["mcq", "open", "code"].includes(q.type) ? q.type : "open",
    prompt: String(q.prompt ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
    rubric: String(q.rubric ?? ""),
    max_points: Number(q.max_points) || 10,
    minutes: Number(q.minutes) || 5
  })).filter((q: AsmtQuestion) => q.prompt);

  return { questions, time_limit_min: Number(data.time_limit_min) || 45, model };
}

export type ScoreResult = {
  overall: number;
  band: "developing" | "proficient" | "strong" | "expert";
  per_question: { question_id: string; points: number; max: number; note: string }[];
  strengths: string[];
  gaps: string[];
  ai_confidence: number;
  flags: string[];
  model?: string;
  error?: string;
};

export async function scoreAssessment(opts: {
  field: string; level: string;
  questions: AsmtQuestion[];
  answers: { question_id: string; answer: string; seconds_spent?: number }[];
}): Promise<ScoreResult> {
  const ansMap = new Map(opts.answers.map((a) => [a.question_id, a]));
  const items = opts.questions.map((q) => ({
    id: q.id, type: q.type, prompt: q.prompt, rubric: q.rubric, max_points: q.max_points,
    answer: ansMap.get(q.id)?.answer ?? "", seconds: ansMap.get(q.id)?.seconds_spent ?? null
  }));

  const prompt = `You are grading a competency assessment for a "${opts.field}" (${opts.level || "mid"} level).
Grade each answer against its rubric. Be a fair but rigorous hiring assessor — reward demonstrated ability, penalise vagueness or answers that don't actually solve the task.

Also judge INTEGRITY: if an answer looks AI-generated, copy-pasted, or implausibly fast/slow versus its length, add a flag.

Questions, rubrics and answers:
${JSON.stringify(items, null, 1)}

Return ONLY JSON:
{
 "per_question":[{"question_id":"q1","points":<0..max>,"max":<max>,"note":"one line why"}],
 "strengths":["..."],
 "gaps":["short, specific skill gaps to improve"],
 "ai_confidence":<0..1, how sure you are of this grading>,
 "flags":["integrity or anomaly flags, empty if none"]
}`;

  const { data, error, model } = await geminiJson(prompt);
  if (error || !data?.per_question) {
    return { overall: 0, band: "developing", per_question: [], strengths: [], gaps: [], ai_confidence: 0, flags: ["scoring_failed"], error: error ?? "scoring failed" };
  }

  const per = (data.per_question as any[]).map((p) => ({
    question_id: String(p.question_id),
    points: Math.max(0, Number(p.points) || 0),
    max: Number(p.max) || 10,
    note: String(p.note ?? "")
  }));
  const totalPts = per.reduce((a, p) => a + p.points, 0);
  const totalMax = per.reduce((a, p) => a + p.max, 0) || 1;
  const overall = Math.round((totalPts / totalMax) * 100);

  const band =
    overall >= 85 ? "expert" :
    overall >= 70 ? "strong" :
    overall >= 50 ? "proficient" : "developing";

  return {
    overall,
    band,
    per_question: per,
    strengths: (data.strengths ?? []).map(String).slice(0, 6),
    gaps: (data.gaps ?? []).map(String).slice(0, 6),
    ai_confidence: Math.min(1, Math.max(0, Number(data.ai_confidence) || 0.5)),
    flags: (data.flags ?? []).map(String).filter(Boolean),
    model
  };
}

/**
 * Decide whether a score needs human review.
 * High stakes (top band), low confidence, or any integrity flag → review.
 */
export function needsHumanReview(s: ScoreResult): boolean {
  if (s.flags.length > 0) return true;
  if (s.ai_confidence < 0.65) return true;
  if (s.band === "expert") return true;           // top badge always confirmed
  if (s.overall >= 48 && s.overall <= 52) return true; // borderline pass/fail
  return false;
}

/**
 * JOB-SPECIFIC assessment — generated from a PARTICULAR posting's requirements,
 * not the candidate's generic field. This is the employer-ordered deep-check
 * for their shortlist. It is materially different from the general test because
 * it's built around the role's actual duties and required skills.
 */
export async function generateJobAssessment(opts: {
  job_title: string; job_description: string; requirements: string[]; level: string;
}): Promise<{ questions: AsmtQuestion[]; time_limit_min: number; model?: string; error?: string }> {
  const reqs = (opts.requirements ?? []).filter(Boolean).slice(0, 10).join("; ");
  const prompt = `You are a hiring assessor creating a JOB-SPECIFIC competency test for a SHORTLISTED candidate.
This test must be tailored to THIS EXACT ROLE, not the candidate's general field.

Role title: "${opts.job_title}"
Seniority: "${opts.level || "mid"}"
Key requirements: ${reqs || "n/a"}
Role description: "${(opts.job_description || "").slice(0, 800)}"

Create a practical assessment that verifies the candidate can do THIS specific job's duties and meet THESE requirements. Ground every question in the role above — reference its actual responsibilities and required skills. Mix:
- 2 multiple-choice on role-critical knowledge (type "mcq", 4 "options")
- 2-3 open-response questions that mirror real tasks from THIS role (type "open")
- If technical, 1 "code"/work-sample question drawn from the role's stack.

For EACH question include a concise "rubric" (what a strong answer shows FOR THIS ROLE), "max_points" (10-25), "minutes" (3-15). Total 30-50 min.

Return ONLY JSON:
{"time_limit_min": <int>, "questions": [{"id":"q1","type":"mcq","prompt":"...","options":["..."],"rubric":"..","max_points":10,"minutes":4}, ...]}`;

  const { data, error, model } = await geminiJson(prompt);
  if (error || !data?.questions?.length) return { questions: [], time_limit_min: 45, error: error ?? "No questions generated" };

  const questions: AsmtQuestion[] = data.questions.map((q: any, i: number) => ({
    id: q.id || `q${i + 1}`,
    type: ["mcq", "open", "code"].includes(q.type) ? q.type : "open",
    prompt: String(q.prompt ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
    rubric: String(q.rubric ?? ""),
    max_points: Number(q.max_points) || 10,
    minutes: Number(q.minutes) || 5
  })).filter((q: AsmtQuestion) => q.prompt);

  return { questions, time_limit_min: Number(data.time_limit_min) || 45, model };
}
