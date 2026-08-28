/**
 * What employers ask for, against what the pool actually has.
 *
 * ON "INDUSTRY STANDARD": this deliberately does NOT use a hardcoded skills
 * list or an LLM's opinion of what a role should require. Both would be a
 * generic guess — calibrated to a global market, stale on arrival, and
 * presented with an authority they haven't earned. Training decisions worth
 * real money should not rest on that.
 *
 * The benchmark used instead is the demand already in the database: the text
 * of job descriptions written by employers in this market, weighted towards
 * recent postings. If employers here keep asking for a thing, that is the
 * standard that matters — it is current, local, and someone is paying for it.
 *
 * The supply side is the indexed CV text. Both sides are measured, not assumed.
 */

/**
 * Words that carry no signal.
 *
 * Deliberately limited to grammar and recruitment boilerplate. An earlier
 * version also stripped domain nouns — "customer", "service", "support",
 * "management" — which silently destroyed real skill phrases: "customer
 * service" is one of the most common requirements in this market and it
 * disappeared entirely. Anything that could name a skill stays in.
 */
const STOP = new Set(`a an the and or but if then than that this these those with without within
of in on at to for from by as is are was were be been being have has had do does did will would
shall should can could may might must not no nor so such own same too very just also about above
below under over again further once here there when where why how all any both each few more most
other some only we you they he she it its our your their his her them us me my i
experience experienced role position job candidate candidates applicant applicants
required requirement requirements responsibility responsibilities duty duties
ability able strong good excellent great must years year minimum least plus preferred
ideal ideally successful join opportunity apply application applying please send cv resume
email contact salary competitive benefits looking seeking wanted needs need needed hiring hire
etc using use used various relevant related new day days week weeks month months
high low well including include includes included across per via into out up down off
through during before after between suitable interested able willing
level senior junior mid entry
company organisation organization firm
we're were you'll we'll`
  .split(/\s+/).filter(Boolean));

export type SkillSignal = {
  term: string;
  /** Job posts mentioning it, and what share of posts that is. */
  demand: number;
  demand_pct: number;
  /** Indexed CVs mentioning it, and what share of the pool that is. */
  supply: number;
  supply_pct: number;
  /** demand_pct − supply_pct. Positive means employers want more than exists. */
  gap: number;
  verdict: "critical" | "short" | "matched" | "surplus";
  niches: string[];
};

const clean = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").replace(/\s+/g, " ");

/**
 * Candidate terms from a body of text: single words plus two- and three-word
 * phrases. Phrases matter — "customer service" and "data analysis" carry
 * meaning that "customer" and "data" alone do not.
 */
export function extractTerms(text: string): Set<string> {
  // Keep stopwords in the word list so phrases stay intact — "years of
  // experience" should not become "years experience" — then filter at the
  // point terms are emitted.
  const words = clean(text).split(" ").filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const out = new Set<string>();
  const useful = (w: string) => !STOP.has(w);

  for (let i = 0; i < words.length; i++) {
    if (useful(words[i])) out.add(words[i]);

    // A phrase earns its place if every word in it is meaningful. Requiring
    // only one would readmit "of experience" and similar noise.
    if (i + 1 < words.length && useful(words[i]) && useful(words[i + 1]))
      out.add(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length && useful(words[i]) && useful(words[i + 1]) && useful(words[i + 2]))
      out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
}

/** Whole-word containment, so "sap" doesn't match inside "sapphire". */
function mentions(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export function analyseSkillGap(
  jobs: { id: string; title: string; description: string; niche?: string | null; created_at: string }[],
  resumes: { content: string }[],
  opts: { maxTerms?: number; minDemand?: number } = {}
): SkillSignal[] {
  const maxTerms = opts.maxTerms ?? 90;
  const minDemand = opts.minDemand ?? 2;

  if (!jobs.length || !resumes.length) return [];

  // 1 · How many job posts mention each candidate term?
  const jobTexts = jobs.map((j) => ({
    text: clean(`${j.title} ${j.description}`),
    niche: j.niche ?? null
  }));

  const demandCount = new Map<string, number>();
  const termNiches = new Map<string, Set<string>>();
  for (const j of jobTexts) {
    // Count each term once per post, so one verbose ad can't dominate.
    // Array.from rather than for-of: the project targets a lower ES level
    // where iterating a Set directly needs downlevelIteration.
    for (const term of Array.from(extractTerms(j.text))) {
      demandCount.set(term, (demandCount.get(term) ?? 0) + 1);
      if (j.niche) {
        if (!termNiches.has(term)) termNiches.set(term, new Set());
        termNiches.get(term)!.add(j.niche);
      }
    }
  }

  // 2 · Keep terms real demand supports. A term in one ad is that employer's
  // phrasing; a term across several is a market signal.
  let candidates = Array.from(demandCount.entries())
    .filter(([term, n]) => n >= minDemand && term.length >= 3)
    .sort((a, b) => b[1] - a[1]);

  // Drop a shorter term when a longer phrase containing it is just as common —
  // "customer service" is the signal, "customer" on its own is noise.
  const kept: [string, number][] = [];
  for (const [term, n] of candidates) {
    const subsumed = kept.some(([k, kn]) => k.includes(term) && kn >= n * 0.8);
    if (!subsumed) kept.push([term, n]);
    if (kept.length >= maxTerms) break;
  }

  // 3 · How many CVs mention each surviving term?
  const cvTexts = resumes.map((r) => clean(r.content ?? ""));

  return kept.map(([term, demand]) => {
    const supply = cvTexts.filter((c) => mentions(c, term)).length;
    const demandPct = demand / jobs.length;
    const supplyPct = supply / resumes.length;
    const gap = demandPct - supplyPct;

    let verdict: SkillSignal["verdict"] = "matched";
    if (demandPct >= 0.3 && supplyPct < 0.05) verdict = "critical";
    else if (gap >= 0.2) verdict = "short";
    else if (gap <= -0.25) verdict = "surplus";

    return {
      term, demand, supply,
      demand_pct: Math.round(demandPct * 100),
      supply_pct: Math.round(supplyPct * 100),
      gap: Math.round(gap * 100),
      verdict,
      niches: Array.from(termNiches.get(term) ?? []).slice(0, 3)
    };
  }).sort((a, b) => b.gap - a.gap || b.demand - a.demand);
}

/** Turn the sharpest gaps into training topics with evidence attached. */
export function skillTrainingIdeas(signals: SkillSignal[], poolSize: number, opts: {
  training_fee: number; take_rate: number; placement_fee: number;
}) {
  return signals
    .filter((s) => (s.verdict === "critical" || s.verdict === "short") && s.demand >= 2)
    .slice(0, 5)
    .map((s) => {
      // Addressable audience: people who do NOT already have it.
      const audience = Math.max(0, poolSize - s.supply);
      const learners = Math.max(1, Math.round(audience * opts.take_rate * 0.5));
      return {
        title: `${s.term.replace(/\b\w/g, (c) => c.toUpperCase())} for the pool`,
        rationale: s.verdict === "critical"
          ? "Employers ask for this constantly and almost nobody in the pool shows it on their CV."
          : "Demand for this clearly outruns what the pool can evidence.",
        evidence: `Named in ${s.demand_pct}% of job posts (${s.demand} of them) but appears in only ${s.supply_pct}% of CVs (${s.supply}).`,
        audience,
        demand_signal: s.demand,
        projected_learners: learners,
        projected_revenue: Math.round(learners * opts.training_fee),
        downstream_value: Math.round(s.demand * opts.placement_fee * 0.2),
        priority: (s.verdict === "critical" ? "high" : s.gap >= 30 ? "medium" : "low") as "high" | "medium" | "low"
      };
    });
}
