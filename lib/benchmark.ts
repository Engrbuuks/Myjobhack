/**
 * Measure the pool against what the market requires.
 *
 * Independent of employer demand on the platform: the benchmark comes from
 * skill_benchmarks (web-grounded or hand-entered), and the pool side comes
 * from indexed CV text. That means deficiencies are visible before a single
 * employer posts — which is when they are most useful, since a training takes
 * months to design and run.
 */

export type BenchmarkRow = {
  id: string;
  skill: string;
  importance: "core" | "important" | "nice";
  why: string;
  niche_label: string;
  role_level: string | null;
  source: string;
  sources: { title: string; uri: string }[];
  approved: boolean;
};

export type Coverage = BenchmarkRow & {
  /** Indexed CVs evidencing this skill. */
  have: number;
  pool: number;
  coverage_pct: number;
  /** How much this shortfall matters: importance × how few people have it. */
  severity: number;
  verdict: "critical" | "weak" | "developing" | "covered";
};

const WEIGHT = { core: 3, important: 2, nice: 1 } as const;

/** Whole-word match, so "sap" is not found inside "sapphire". */
function mentions(text: string, term: string): boolean {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  if (!escaped) return false;
  try { return new RegExp(`\\b${escaped}\\b`, "i").test(text); }
  catch { return text.toLowerCase().includes(term.toLowerCase()); }
}

export function measureAgainstBenchmark(
  benchmarks: BenchmarkRow[],
  resumes: { content: string }[]
): Coverage[] {
  const pool = resumes.length;
  const texts = resumes.map((r) => (r.content ?? "").replace(/\s+/g, " "));

  return benchmarks.map((b) => {
    const have = pool ? texts.filter((t) => mentions(t, b.skill)).length : 0;
    const pct = pool ? Math.round((have / pool) * 100) : 0;

    // A core skill only 5% of the pool evidences is a far bigger problem than
    // a nice-to-have only 5% have. Weight the shortfall by importance.
    const severity = Math.round((100 - pct) * (WEIGHT[b.importance] ?? 2));

    let verdict: Coverage["verdict"] = "covered";
    // A core requirement only a quarter of the pool can evidence is critical:
    // most candidates would be filtered out before a human reads their CV.
    // (The bound is inclusive — an earlier `< 20` let exactly-20% slip through
    // as merely "weak", understating the worst gaps.)
    if (b.importance === "core" && pct <= 25) verdict = "critical";
    else if (pct <= 15) verdict = "critical";
    else if (pct < 40) verdict = "weak";
    else if (pct < 70) verdict = "developing";

    return { ...b, have, pool, coverage_pct: pct, severity, verdict };
  }).sort((a, b) => b.severity - a.severity);
}

/** Group the worst shortfalls into trainings, sized and costed. */
export function benchmarkTrainings(coverage: Coverage[], opts: {
  training_fee: number; take_rate: number; placement_fee: number;
}) {
  const worst = coverage.filter((c) => c.verdict === "critical" || c.verdict === "weak").slice(0, 6);

  return worst.map((c) => {
    // Everyone who cannot currently evidence it.
    const audience = Math.max(0, c.pool - c.have);
    const learners = Math.max(1, Math.round(audience * opts.take_rate));
    return {
      title: `${c.skill} — close the market gap`,
      rationale: c.importance === "core"
        ? "The market treats this as a baseline requirement and most of the pool cannot evidence it."
        : "Commonly required in this niche and thinly covered across the pool.",
      evidence: `${c.coverage_pct}% of indexed CVs mention it (${c.have} of ${c.pool}). Rated ${c.importance} for ${c.niche_label || "this niche"}.`,
      audience,
      demand_signal: WEIGHT[c.importance] ?? 2,
      projected_learners: learners,
      projected_revenue: Math.round(learners * opts.training_fee),
      // Conservative: a trained cohort converting at 10% into placements.
      downstream_value: Math.round(learners * 0.1 * opts.placement_fee),
      priority: (c.verdict === "critical" && c.importance === "core" ? "high"
        : c.verdict === "critical" ? "medium" : "low") as "high" | "medium" | "low"
    };
  });
}

/**
 * Job boards worth pointing the search at, by market.
 *
 * These are the places roles are actually advertised, so they carry the most
 * current signal. But a benchmark built only from live ads inherits whatever
 * is being hired for THIS MONTH, which is noisy and seasonal — and a single
 * board's editorial habits can dominate. The prompt therefore requires other
 * source types alongside, and the mix that came back is measured below rather
 * than assumed.
 */
export const DEFAULT_JOB_BOARDS: Record<string, string[]> = {
  Nigeria: ["jobberman.com", "myjobmag.com", "hotnigerianjobs.com", "ngcareers.com",
            "jobgurus.com.ng", "ng.indeed.com", "linkedin.com/jobs"],
  Kenya: ["brightermonday.co.ke", "fuzu.com", "myjobmag.co.ke", "linkedin.com/jobs"],
  Ghana: ["jobberman.com.gh", "myjobmag.com.gh", "jobsinghana.com", "linkedin.com/jobs"],
  default: ["linkedin.com/jobs", "indeed.com", "glassdoor.com"]
};

export function boardsFor(region: string): string[] {
  const key = Object.keys(DEFAULT_JOB_BOARDS).find(
    (k) => k.toLowerCase() === region.trim().toLowerCase());
  return DEFAULT_JOB_BOARDS[key ?? "default"];
}

/** Anything that is clearly a job board, as opposed to a report or body. */
const BOARD_HINT = /(job|career|vacanc|recruit|hiring|indeed|linkedin|glassdoor|brightermonday|fuzu)/i;

export type SourceMix = {
  job_boards: { title: string; uri: string; host: string }[];
  other: { title: string; uri: string; host: string }[];
  distinct_hosts: number;
  /** True when one domain supplied most of the evidence. */
  concentrated: boolean;
  warning: string | null;
};

/**
 * Classify the pages the search actually used.
 *
 * This is measured from returned URLs, not from what the model says it did —
 * a model asked to "use several sources" will happily claim to have done so.
 */
export function classifySources(sources: { title: string; uri: string }[]): SourceMix {
  const withHost = sources.map((s) => {
    let host = "";
    try { host = new URL(s.uri).hostname.replace(/^www\./, ""); } catch { host = s.uri.slice(0, 40); }
    return { ...s, host };
  });

  const job_boards = withHost.filter((s) => BOARD_HINT.test(s.host) || BOARD_HINT.test(s.uri));
  const other = withHost.filter((s) => !job_boards.includes(s));
  const hosts = new Set(withHost.map((s) => s.host));

  const counts = new Map<string, number>();
  withHost.forEach((s) => counts.set(s.host, (counts.get(s.host) ?? 0) + 1));
  const top = Math.max(0, ...Array.from(counts.values()));
  const concentrated = withHost.length > 0 && top / withHost.length > 0.6;

  let warning: string | null = null;
  if (withHost.length === 0)
    warning = "The search returned no citable sources. Treat these skills as unverified and check them by hand before acting.";
  else if (hosts.size === 1)
    warning = `Everything came from one site (${Array.from(hosts)[0]}). That is a single editorial view of the market — worth a second fetch or a manual cross-check.`;
  else if (concentrated)
    warning = "One site supplied most of the evidence. The picture may reflect that board's listings rather than the market.";
  else if (other.length === 0)
    warning = "All sources were job boards. Live ads show what is being hired for right now, which is seasonal — a skills or salary report would balance it.";

  return { job_boards, other, distinct_hosts: hosts.size, concentrated, warning };
}

/**
 * The prompt used to fetch a benchmark. Written to force specifics and to
 * make vagueness impossible to hide: every skill must carry a reason, and
 * the model is told to prefer named tools and certifications over soft
 * generalities, which are useless as training topics.
 */
export function benchmarkPrompt(
  niche: string, roleLevel: string, region: string, boards?: string[]
): string {
  const jobBoards = (boards?.length ? boards : boardsFor(region)).join(", ");
  return `Search the web for what employers currently require when hiring ${roleLevel || "any level"} ${niche} professionals in ${region}, as of ${new Date().getFullYear()}.

Draw on ALL of the following, not just one:
1. Live job advertisements on ${region} job boards — search these specifically: ${jobBoards}. Read what the ads actually list under requirements.
2. Industry skills or salary reports covering ${region} or West Africa.
3. Professional body and certification requirements relevant to ${niche}.
4. Curricula from training providers in ${region} for this field.

Do not rely on job boards alone. Live ads show what is being hired for this month, which is seasonal and skewed by whoever happens to be recruiting. Where the ads and the reports disagree, prefer what appears in BOTH, and say so in the reason.

Prefer sources from the last 18 months.

Return ONLY a JSON object, no prose and no markdown fences:

{
  "skills": [
    {
      "skill": "short searchable term, 1-3 words, as it would literally appear written on a CV",
      "importance": "core" | "important" | "nice",
      "why": "one sentence on why employers in ${region} ask for it, citing what you found"
    }
  ]
}

Rules:
- 12 to 18 skills.
- Name specific, checkable things: software, tools, certifications, standards, regulations, techniques, languages. For example "QuickBooks", "IFRS", "PMP", "Power BI", "HACCP".
- Avoid vague soft skills such as "communication", "teamwork", "hardworking" — they cannot be trained against or measured on a CV.
- "core" means a candidate without it is usually filtered out. "important" is frequently asked for. "nice" is a differentiator.
- Reflect the ${region} market specifically, not the global or US market, wherever the two differ.
- Each "skill" must be a term that would plausibly appear verbatim in a CV, because it is matched against CV text.`;
}
