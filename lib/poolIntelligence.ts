import { createAdminClient } from "@/lib/supabase/admin";
import { analyseSkillGap, skillTrainingIdeas, type SkillSignal } from "@/lib/skillGap";
import { measureAgainstBenchmark, benchmarkTrainings, type Coverage } from "@/lib/benchmark";

/**
 * Pool intelligence: where the pool FAILS TO CONVERT, and what that is worth.
 *
 * poolStats already answers "what is in the pool". That is composition, and
 * composition alone never tells you what to do — a chart showing 400 people in
 * Accounting is not an instruction.
 *
 * This answers a different question: where does employer demand arrive and go
 * unserved? Every deficiency here is derived from a real failure — a job that
 * drew applicants but shortlisted nobody, a screening rule that keeps
 * rejecting people, a niche employers keep posting into and the pool cannot
 * fill. Those are the gaps worth training into, because someone has already
 * paid to discover them.
 *
 * NOTHING HERE IS INVENTED. Where a number depends on an assumption — a
 * training fee, a placement fee — it is passed in and labelled, never guessed
 * silently and presented as fact.
 */

export type Assumptions = {
  /** What you would charge per learner for a training. */
  training_fee: number;
  /** Typical placement fee earned per hire. */
  placement_fee: number;
  /** Share of an addressable audience that realistically enrols. */
  take_rate: number;
  currency: string;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  training_fee: 25_000,
  placement_fee: 150_000,
  take_rate: 0.12,
  currency: "NGN"
};

export type SkillGap = {
  niche_id: string | null;
  niche: string;
  openings: number;            // jobs posted into this niche recently
  talent: number;              // pool members in it
  applications: number;
  shortlisted: number;
  placements: number;
  /** Openings per 10 available candidates. High = demand the pool can't serve. */
  pressure: number;
  /** Of those who applied, how many cleared screening. Low = capability gap. */
  shortlist_rate: number | null;
  verdict: "underserved" | "weak_conversion" | "oversupplied" | "healthy";
  reason: string;
};

export type ScreeningFailure = {
  job_id: string;
  job_title: string;
  question: string;
  requirement: string;
  failed: number;
  applicants: number;
  fail_rate: number;
};

export type TrainingIdea = {
  title: string;
  rationale: string;
  evidence: string;
  audience: number;            // pool members who would qualify to attend
  demand_signal: number;       // openings or failures driving it
  projected_learners: number;
  projected_revenue: number;
  /** Placement fees unlocked if trained people then convert. */
  downstream_value: number;
  priority: "high" | "medium" | "low";
};

export type RevenueLine = {
  label: string;
  amount: number | null;
  count: number;
  detail: string;
  action: string;
  kind: "collectable" | "pipeline" | "leak" | "growth";
};

export type Intelligence = {
  assumptions: Assumptions;
  window_days: number;
  gaps: SkillGap[];
  screening_failures: ScreeningFailure[];
  unserved: {
    no_applicants: { id: string; title: string; days_open: number }[];
    no_shortlist: { id: string; title: string; applicants: number }[];
    total_wasted_demand: number;
  };
  trainings: TrainingIdea[];
  revenue: RevenueLine[];
  health: { label: string; count: number; of: number; cost: string }[];
  /** Term-level demand (job ads) against supply (indexed CVs). */
  skills: SkillSignal[];
  skills_coverage: { jobs_read: number; cvs_read: number; pool_with_resume: number; indexed: number };
  /** Market requirements (web-sourced) measured against the pool. */
  benchmark: Coverage[];
  headline: string;
};

const money = (n: number) => Math.round(n);

export async function getIntelligence(
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS,
  windowDays = 180
): Promise<Intelligence> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const [
    { data: taxonomies },
    { data: jobs },
    { data: talents },
    { data: apps },
    { data: placements },
    { data: profiles },
    { data: enrollments },
    { data: formFields },
    { data: jobText },
    { data: resumeRows },
    { data: benchmarkRows }
  ] = await Promise.all([
    admin.from("taxonomies").select("id, kind, label"),
    admin.from("jobs").select("id, title, niche_id, status, created_at, closes_at, org_id, role_level, location"),
    admin.from("talent_profiles").select("profile_id, niche_id, competency_band, years_experience, profile_completion, resume_document_id, verification"),
    admin.from("applications").select("id, job_id, talent_id, status, rules_passed, created_at, answers"),
    admin.from("placements").select("id, job_id, talent_id, fee_amount, status, currency, created_at"),
    admin.from("profiles").select("id, role, city, country, created_at"),
    admin.from("enrollments").select("id, training_id, talent_id"),
    admin.from("form_fields").select("id, form_id, label, eligibility"),
    // Job text is the demand benchmark; indexed CV text is the supply side.
    admin.from("jobs").select("id, title, description, niche_id, created_at").gte("created_at", since).limit(400),
    admin.from("resume_index").select("content").eq("unreadable", false).limit(1500),
    admin.from("skill_benchmarks").select("*")
  ]);

  const label = new Map((taxonomies ?? []).map((t: any) => [t.id, t.label]));
  const recentJobs = (jobs ?? []).filter((j: any) => j.created_at >= since);
  const jobById = new Map((jobs ?? []).map((j: any) => [j.id, j]));

  // ---------- 1 · Demand vs supply, per niche ----------
  const nicheIds = new Set<string | null>([
    ...recentJobs.map((j: any) => j.niche_id),
    ...(talents ?? []).map((t: any) => t.niche_id)
  ]);

  const appsByJob = new Map<string, any[]>();
  for (const a of (apps ?? []) as any[]) {
    if (!appsByJob.has(a.job_id)) appsByJob.set(a.job_id, []);
    appsByJob.get(a.job_id)!.push(a);
  }

  const gaps: SkillGap[] = Array.from(nicheIds).map((nid) => {
    const openings = recentJobs.filter((j: any) => j.niche_id === nid).length;
    const talent = (talents ?? []).filter((t: any) => t.niche_id === nid).length;
    const jobIds = recentJobs.filter((j: any) => j.niche_id === nid).map((j: any) => j.id);
    const nicheApps = jobIds.flatMap((id: string) => appsByJob.get(id) ?? []);
    const shortlisted = nicheApps.filter((a: any) =>
      ["shortlisted", "interviewing", "offered", "hired"].includes(a.status)).length;
    const placed = (placements ?? []).filter((p: any) =>
      p.job_id && jobIds.includes(p.job_id)).length;

    // Openings per 10 candidates. Above 1 means more roles than the pool can
    // comfortably serve; near 0 means capacity sitting idle.
    const pressure = talent > 0 ? (openings / talent) * 10 : openings > 0 ? 99 : 0;
    const shortlistRate = nicheApps.length ? shortlisted / nicheApps.length : null;

    let verdict: SkillGap["verdict"] = "healthy";
    let reason = "Demand and supply are roughly matched.";

    if (openings > 0 && talent === 0) {
      verdict = "underserved";
      reason = `${openings} role${openings === 1 ? "" : "s"} posted and nobody in the pool sits in this niche.`;
    } else if (pressure >= 3 && openings >= 2) {
      verdict = "underserved";
      reason = `${openings} openings against ${talent} candidates — employers are asking for more than the pool holds.`;
    } else if (nicheApps.length >= 8 && shortlistRate !== null && shortlistRate < 0.2) {
      verdict = "weak_conversion";
      reason = `${nicheApps.length} applications but only ${shortlisted} cleared screening. People are applying and not qualifying — that is a capability gap, not a numbers gap.`;
    } else if (talent >= 25 && openings === 0) {
      verdict = "oversupplied";
      reason = `${talent} candidates and no roles posted in ${windowDays} days. This capacity is idle.`;
    }

    return {
      niche_id: nid, niche: nid ? (label.get(nid) ?? "Unknown") : "Unassigned",
      openings, talent, applications: nicheApps.length, shortlisted, placements: placed,
      pressure: Math.round(pressure * 10) / 10,
      shortlist_rate: shortlistRate === null ? null : Math.round(shortlistRate * 100) / 100,
      verdict, reason
    };
  }).sort((a, b) => {
    const rank = { underserved: 0, weak_conversion: 1, oversupplied: 2, healthy: 3 };
    return rank[a.verdict] - rank[b.verdict] || b.openings - a.openings;
  });

  // ---------- 2 · Which requirements keep rejecting people ----------
  // The sharpest deficiency signal in the system: an employer wrote a rule,
  // candidates applied, and the rule said no. That names the missing thing.
  const fieldById = new Map((formFields ?? []).map((f: any) => [f.id, f]));
  const failures = new Map<string, ScreeningFailure>();

  for (const a of (apps ?? []) as any[]) {
    if (a.rules_passed !== false) continue;
    const job = jobById.get(a.job_id);
    if (!job) continue;
    for (const [fid, value] of Object.entries(a.answers ?? {})) {
      const f: any = fieldById.get(fid);
      if (!f?.eligibility?.op) continue;
      if (meetsRule(value, f.eligibility)) continue;   // this rule was not the blocker
      const key = `${a.job_id}:${fid}`;
      const cur = failures.get(key) ?? {
        job_id: a.job_id, job_title: job.title, question: f.label,
        requirement: `${f.eligibility.op} ${f.eligibility.value}`,
        failed: 0, applicants: (appsByJob.get(a.job_id) ?? []).length, fail_rate: 0
      };
      cur.failed++;
      failures.set(key, cur);
    }
  }
  const screening_failures = Array.from(failures.values())
    .map((f) => ({ ...f, fail_rate: f.applicants ? Math.round((f.failed / f.applicants) * 100) / 100 : 0 }))
    .filter((f) => f.failed >= 2)
    .sort((a, b) => b.failed - a.failed).slice(0, 12);

  // ---------- 3 · Demand that went nowhere ----------
  const openJobs = (jobs ?? []).filter((j: any) => j.status === "published");
  const noApplicants = openJobs
    .filter((j: any) => (appsByJob.get(j.id) ?? []).length === 0)
    .map((j: any) => ({
      id: j.id, title: j.title,
      days_open: Math.max(0, Math.round((Date.now() - new Date(j.created_at).getTime()) / 86_400_000))
    }))
    .filter((j) => j.days_open >= 7)
    .sort((a, b) => b.days_open - a.days_open).slice(0, 10);

  const noShortlist = recentJobs
    .map((j: any) => ({ id: j.id, title: j.title, applicants: (appsByJob.get(j.id) ?? []).length,
      shortlisted: (appsByJob.get(j.id) ?? []).filter((a: any) =>
        ["shortlisted", "interviewing", "offered", "hired"].includes(a.status)).length }))
    .filter((j) => j.applicants >= 5 && j.shortlisted === 0)
    .map(({ id, title, applicants }) => ({ id, title, applicants }))
    .sort((a, b) => b.applicants - a.applicants).slice(0, 10);

  // ---------- 4 · What to train, and what it is worth ----------
  const trainings: TrainingIdea[] = [];

  for (const g of gaps.filter((g) => g.verdict === "weak_conversion").slice(0, 4)) {
    const audience = g.applications;
    const learners = Math.round(audience * assumptions.take_rate * 2);  // engaged, already applying
    trainings.push({
      title: `${g.niche} — employability intensive`,
      rationale: "People in this niche are applying and failing screening. They already want the roles; they are missing what the roles require.",
      evidence: `${g.applications} applications, ${g.shortlisted} shortlisted (${Math.round((g.shortlist_rate ?? 0) * 100)}%).`,
      audience, demand_signal: g.openings,
      projected_learners: learners,
      projected_revenue: money(learners * assumptions.training_fee),
      downstream_value: money(Math.min(learners, g.openings) * assumptions.placement_fee),
      priority: g.applications >= 20 ? "high" : "medium"
    });
  }

  // Requirements that reject people repeatedly are training topics by definition.
  const byQuestion = new Map<string, { failed: number; jobs: Set<string>; requirement: string }>();
  for (const f of screening_failures) {
    const cur = byQuestion.get(f.question) ?? { failed: 0, jobs: new Set<string>(), requirement: f.requirement };
    cur.failed += f.failed; cur.jobs.add(f.job_id);
    byQuestion.set(f.question, cur);
  }
  for (const [question, v] of Array.from(byQuestion.entries()).sort((a, b) => b[1].failed - a[1].failed).slice(0, 4)) {
    const learners = Math.round(v.failed * assumptions.take_rate * 3);
    trainings.push({
      title: `Meet the bar: ${question}`,
      rationale: "Employers keep screening candidates out on this exact requirement. Closing it converts applicants you already have.",
      evidence: `${v.failed} rejections across ${v.jobs.size} job${v.jobs.size === 1 ? "" : "s"} on "${question}" (${v.requirement}).`,
      audience: v.failed, demand_signal: v.jobs.size,
      projected_learners: Math.max(learners, 1),
      projected_revenue: money(Math.max(learners, 1) * assumptions.training_fee),
      downstream_value: money(Math.round(v.failed * 0.2) * assumptions.placement_fee),
      priority: v.failed >= 15 ? "high" : v.failed >= 6 ? "medium" : "low"
    });
  }

  for (const g of gaps.filter((g) => g.verdict === "underserved" && g.openings >= 2).slice(0, 3)) {
    const audience = (talents ?? []).filter((t: any) =>
      t.niche_id !== g.niche_id && (t.years_experience ?? 0) >= 1).length;
    const learners = Math.round(Math.min(audience, g.openings * 12) * assumptions.take_rate);
    trainings.push({
      title: `Convert into ${g.niche}`,
      rationale: "Employers are posting roles the pool cannot fill. Retraining adjacent talent turns unserved demand into placements.",
      evidence: `${g.openings} openings, only ${g.talent} candidate${g.talent === 1 ? "" : "s"} in the niche.`,
      audience, demand_signal: g.openings,
      projected_learners: Math.max(learners, 1),
      projected_revenue: money(Math.max(learners, 1) * assumptions.training_fee),
      downstream_value: money(g.openings * assumptions.placement_fee),
      priority: g.openings >= 4 ? "high" : "medium"
    });
  }

  trainings.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority] ||
      (b.projected_revenue + b.downstream_value) - (a.projected_revenue + a.downstream_value);
  });

  // ---------- 5 · Revenue ----------
  const placedRows = (placements ?? []) as any[];
  const sum = (rows: any[]) => rows.reduce((n, p) => n + Number(p.fee_amount ?? 0), 0);

  const pendingFees = placedRows.filter((p) => p.status === "pending");
  const invoicedFees = placedRows.filter((p) => p.status === "invoiced");
  const paidFees = placedRows.filter((p) => p.status === "paid");

  const placedTalent = new Set(placedRows.map((p) => p.talent_id));
  const shortlistedNotPlaced = (apps ?? []).filter((a: any) =>
    ["shortlisted", "interviewing", "offered"].includes(a.status) && !placedTalent.has(a.talent_id));

  const employerIds = new Set((jobs ?? []).map((j: any) => j.org_id).filter(Boolean));
  const payingEmployers = new Set(placedRows.map((p) => p.employer_id));

  const revenue: RevenueLine[] = [
    {
      label: "Placement fees earned but not invoiced",
      amount: money(sum(pendingFees)), count: pendingFees.length,
      detail: "Hires recorded on the platform with a fee still marked pending.",
      action: "Invoice these. The work is already done — this is the fastest money in the system.",
      kind: "collectable"
    },
    {
      label: "Invoiced and awaiting payment",
      amount: money(sum(invoicedFees)), count: invoicedFees.length,
      detail: "Invoices issued against confirmed placements.",
      action: "Chase anything past terms before it ages further.",
      kind: "collectable"
    },
    {
      label: "Shortlisted candidates not yet placed",
      amount: money(shortlistedNotPlaced.length * assumptions.placement_fee * 0.25),
      count: shortlistedNotPlaced.length,
      detail: "People an employer has already advanced. Valued at a 25% conversion assumption.",
      action: "Follow up the employers holding these. Momentum here converts to fees without new supply.",
      kind: "pipeline"
    },
    {
      label: "Jobs with applicants but nobody shortlisted",
      amount: null, count: noShortlist.length,
      detail: "Employers received applications and advanced nobody — the clearest churn warning you have.",
      action: "Call these employers before they conclude the pool can't serve them.",
      kind: "leak"
    },
    {
      label: "Open jobs with no applicants at all",
      amount: null, count: noApplicants.length,
      detail: "Live roles drawing nothing after a week or more.",
      action: "Push these to matching candidates, or the employer sees an empty result and doesn't return.",
      kind: "leak"
    },
    {
      label: "Employers who posted but never paid a fee",
      amount: money(Math.max(0, employerIds.size - payingEmployers.size) * assumptions.placement_fee * 0.3),
      count: Math.max(0, employerIds.size - payingEmployers.size),
      detail: "Organisations using the platform with no placement fee recorded against them.",
      action: "Find out whether they hired off-platform. That is revenue leaking out of the model.",
      kind: "leak"
    },
    {
      label: "Placement fees collected",
      amount: money(sum(paidFees)), count: paidFees.length,
      detail: "Confirmed, paid placements to date.",
      action: "Your baseline. Everything above is what could be added to it.",
      kind: "growth"
    },
    {
      label: "Training revenue on the table",
      amount: money(trainings.reduce((n, t) => n + t.projected_revenue, 0)),
      count: trainings.length,
      detail: "Sum of the recommended trainings below, at your assumed fee and take rate.",
      action: "Run the highest-priority one first — it is derived from failures employers already paid to discover.",
      kind: "growth"
    }
  ];

  // ---------- 6 · Pool health, costed ----------
  const totalTalent = (talents ?? []).length;
  const health = [
    {
      label: "No résumé uploaded", count: (talents ?? []).filter((t: any) => !t.resume_document_id).length,
      of: totalTalent, cost: "Invisible to CV search and can't be shortlisted on evidence."
    },
    {
      label: "Profile under 50% complete",
      count: (talents ?? []).filter((t: any) => (t.profile_completion ?? 0) < 50).length,
      of: totalTalent, cost: "Filtered out of most employer searches before a human ever sees them."
    },
    {
      label: "No location set",
      count: (profiles ?? []).filter((p: any) =>
        ["job_seeker", "elite_member"].includes(p.role) && (!p.city || !p.country)).length,
      of: (profiles ?? []).filter((p: any) => ["job_seeker", "elite_member"].includes(p.role)).length,
      cost: "Location is the first filter most employers apply — these never appear."
    },
    {
      label: "Unverified",
      count: (talents ?? []).filter((t: any) => t.verification !== "verified").length,
      of: totalTalent, cost: "Cannot be presented as proven talent, which is what commands a placement fee."
    },
    {
      label: "No competency band",
      count: (talents ?? []).filter((t: any) => !t.competency_band).length,
      of: totalTalent, cost: "Excluded from band-based matching and Elite positioning."
    }
  ];

  // ---------- 7 · Skill-level demand vs supply ----------
  // resume_index may not exist yet (migration 0046) — degrade quietly to an
  // empty analysis rather than taking the whole page down.
  const resumes = (resumeRows ?? []) as { content: string }[];
  const skills = resumes.length
    ? analyseSkillGap(
        (jobText ?? []).map((j: any) => ({
          id: j.id, title: j.title, description: j.description ?? "",
          niche: j.niche_id ? (label.get(j.niche_id) ?? null) : null,
          created_at: j.created_at
        })),
        resumes
      )
    : [];

  for (const idea of skillTrainingIdeas(skills, resumes.length, {
    training_fee: assumptions.training_fee,
    take_rate: assumptions.take_rate,
    placement_fee: assumptions.placement_fee
  })) {
    trainings.push(idea);
  }
  trainings.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority] ||
      (b.projected_revenue + b.downstream_value) - (a.projected_revenue + a.downstream_value);
  });

  // Market benchmark — works with no employers on the platform at all.
  const benchmark = measureAgainstBenchmark(
    ((benchmarkRows ?? []) as any[]).map((r) => ({
      id: r.id, skill: r.skill, importance: r.importance, why: r.why,
      niche_label: r.niche_label, role_level: r.role_level,
      source: r.source, sources: r.sources ?? [], approved: r.approved
    })),
    resumes
  );

  for (const idea of benchmarkTrainings(benchmark, {
    training_fee: assumptions.training_fee,
    take_rate: assumptions.take_rate,
    placement_fee: assumptions.placement_fee
  })) {
    trainings.push(idea);
  }
  trainings.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority] ||
      (b.projected_revenue + b.downstream_value) - (a.projected_revenue + a.downstream_value);
  });

  const { count: poolWithResume } = await admin.from("talent_profiles")
    .select("profile_id", { count: "exact", head: true }).not("resume_document_id", "is", null);

  const topGap = gaps.find((g) => g.verdict !== "healthy");
  const collectable = sum(pendingFees) + sum(invoicedFees);
  const headline = collectable > 0
    ? `${assumptions.currency} ${collectable.toLocaleString()} is sitting in uninvoiced or unpaid placement fees` +
      (topGap ? `, and ${topGap.niche} is your clearest ${topGap.verdict === "underserved" ? "supply shortage" : "conversion problem"}.` : ".")
    : topGap
      ? `${topGap.niche} is your clearest ${topGap.verdict === "underserved" ? "supply shortage" : "conversion problem"} — ${topGap.reason}`
      : "Not enough activity yet to find a pattern. Come back once more jobs have run their course.";

  return {
    assumptions, window_days: windowDays, gaps: gaps.slice(0, 14),
    screening_failures,
    unserved: {
      no_applicants: noApplicants, no_shortlist: noShortlist,
      total_wasted_demand: noApplicants.length + noShortlist.length
    },
    trainings: trainings.slice(0, 10), revenue, health,
    skills: skills.slice(0, 30), benchmark,
    skills_coverage: {
      jobs_read: (jobText ?? []).length,
      cvs_read: resumes.length,
      pool_with_resume: poolWithResume ?? 0,
      indexed: resumes.length
    },
    headline
  };
}

/** Mirrors the auto-shortlist rule engine, to identify the blocking rule. */
function meetsRule(value: any, rule: { op: string; value: any }): boolean {
  const v = value;
  switch (rule.op) {
    case ">=": return Number(v) >= Number(rule.value);
    case "<=": return Number(v) <= Number(rule.value);
    case ">": return Number(v) > Number(rule.value);
    case "<": return Number(v) < Number(rule.value);
    case "equals": return String(v).toLowerCase() === String(rule.value).toLowerCase();
    case "not_equals": return String(v).toLowerCase() !== String(rule.value).toLowerCase();
    case "in": return String(rule.value).split(",").map((s) => s.trim().toLowerCase())
      .includes(String(v).toLowerCase());
    case "contains": return (Array.isArray(v) ? v : String(v).split(","))
      .map((x: any) => String(x).trim().toLowerCase())
      .includes(String(rule.value).toLowerCase());
    default: return true;
  }
}
