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

/** How deep the paper goes, by seniority. More senior = more questions, more open work. */
export function paperShape(level: string) {
  const l = (level || "mid").toLowerCase();
  if (l.includes("entry") || l.includes("junior") || l.includes("intern"))
    return { total: 6, mcq: 3, open: 3, code: 0, minutes: 35, difficulty: "entry" };
  if (l.includes("senior") || l.includes("lead"))
    return { total: 10, mcq: 3, open: 6, code: 1, minutes: 70, difficulty: "senior" };
  if (l.includes("manager") || l.includes("head") || l.includes("director") || l.includes("expert"))
    return { total: 12, mcq: 3, open: 8, code: 1, minutes: 85, difficulty: "expert" };
  return { total: 8, mcq: 3, open: 4, code: 1, minutes: 50, difficulty: "mid" };
}

/** Angles the generator rotates through, so two candidates rarely get the same paper. */
const VARIANT_ANGLES = [
  "a diagnostic scenario where something has gone wrong and must be traced to its cause",
  "a prioritisation scenario with competing demands and insufficient time",
  "a quality-control scenario where the candidate must spot what is incorrect in supplied work",
  "a planning scenario requiring a first-week or first-90-day approach",
  "a stakeholder scenario requiring explanation of a technical matter to a non-expert",
  "a resource-constrained scenario where the obvious solution is unavailable",
  "a data-interpretation scenario requiring a decision from incomplete information",
  "an escalation scenario where the candidate must decide what to handle and what to raise"
];

export async function generateAssessment(opts: {
  field: string; level: string; skills: string[]; seed?: string; avoidPrompts?: string[];
}): Promise<{ questions: AsmtQuestion[]; time_limit_min: number; model?: string; error?: string; seed?: string; difficulty?: string }> {
  const skills = opts.skills.filter(Boolean).slice(0, 8).join(", ");
  const shape = paperShape(opts.level);

  // Randomised variant: a seed plus two rotating angles make repeat papers unlikely.
  const seed = opts.seed || Math.random().toString(36).slice(2, 10);
  const pick = (n: number) => VARIANT_ANGLES[(parseInt(seed.slice(n, n + 3), 36) || n) % VARIANT_ANGLES.length];
  const angleA = pick(0), angleB = pick(3);
  const avoid = (opts.avoidPrompts ?? []).slice(0, 12);

  const prompt = `You are a hiring assessor creating a COMPETENCY test for a candidate.
Field/title: "${opts.field}"
Seniority: "${opts.level || "mid"}"
Declared skills: ${skills || "n/a"}
Variant seed: ${seed}

Create a practical assessment that measures whether this person can actually DO this job — not their credentials.

PAPER SHAPE (follow exactly):
- ${shape.mcq} multiple-choice questions (type "mcq", exactly 4 "options")
- ${shape.open} open-response questions (type "open")
${shape.code ? `- ${shape.code} work-sample or "code" question with a concrete task` : "- no code question for this field/level"}
- ${shape.total} questions in total. Total time about ${shape.minutes} minutes.

RESISTANCE TO AI ASSISTANCE — this is critical. Candidates may attempt to answer using an AI chatbot. Write questions that a generic AI answers poorly:
- Anchor open questions in SPECIFIC, MESSY, SITUATIONAL judgement rather than definitions or textbook knowledge.
- Build at least two open questions around: ${angleA}; and ${angleB}.
- Require the candidate to commit to a decision AND justify a trade-off they rejected.
- Ask for concrete specifics — actual numbers, actual sequences, actual first steps — not general principles.
- Prefer "what would you do when X goes wrong and Y is unavailable" over "explain what X is".
- NEVER ask a question whose full answer is a well-known definition, list, or formula.

SCORABILITY — equally critical. A question that cannot be scored consistently is worthless, however clever it is. Every question must be BOTH hard to fake AND reliably markable:
- Each open question must have a small number of DEFENSIBLE correct shapes — a strong answer should be recognisable, not a matter of taste.
- The rubric must list 3-5 CONCRETE, OBSERVABLE things a strong answer contains (a named step, a specific trade-off, a stated assumption, an order of operations) — not vague qualities like "shows good judgement".
- Never ask for pure opinion, personal preference, or anything with no better-or-worse answer.
- Anchor the question so that experience produces specifics a generic answer cannot invent: real sequences, real failure modes, real constraints.

For EACH question include a "rubric" with:
  (a) the 3-5 concrete markers of a strong answer, in order of importance;
  (b) what a GENERIC or AI-generated answer looks like for this question — the textbook shape, the giveaway phrasing, what it will omit — so both the scorer and a human reviewer can tell recitation from experience.
Include "max_points" (10-25) and "minutes" (3-15) per question.
${avoid.length ? `\nDo NOT reuse or closely paraphrase any of these previously-issued prompts:\n- ${avoid.join("\n- ")}` : ""}

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

  return { questions, time_limit_min: Number(data.time_limit_min) || shape.minutes, model, seed, difficulty: shape.difficulty };
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
