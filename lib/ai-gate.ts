import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { eliteSettings, isEliteVerified } from "@/lib/elite";

/**
 * Who may use the toolkit, and how much of it.
 *
 * WHAT CHANGED AND WHY. The Elite page said "every AI tool unlocked" and
 * "unlimited retakes". Neither was true: this file has always capped each
 * tool per day, and assessments have always been capped too. The limits were
 * also global, so a member paying for Elite premium got exactly the same
 * allowance as any toolkit subscriber, which meant the premium tier bought
 * nothing here at all.
 *
 * The allowance is now one pool of credits a month, weighted by what each
 * tool actually costs to run, and it differs by tier. One number a member
 * can hold in their head, and one number the business can set from its
 * margin instead of from optimism.
 *
 * The daily number is not a second allowance. It exists so a runaway client
 * or a shared login cannot spend a whole month in an hour.
 */

export const TOOL_DB: Record<string, string> = {
  "resume-review": "resume_review",
  "interview-prep": "interview_prep",
  "skills-gap": "skills_gap"
};

export type ToolkitTier = "subscriber" | "elite";

/** Start of "today" in Africa/Lagos (WAT, UTC+1) — the reset users are promised. */
function lagosDayStart(): string {
  const now = new Date(Date.now() + 3600_000);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3600_000;
  return new Date(start).toISOString();
}

/** Start of the current month, on the same clock. */
function lagosMonthStart(): string {
  const now = new Date(Date.now() + 3600_000);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3600_000;
  return new Date(start).toISOString();
}

/** When the monthly pool refills, in words a member can act on. */
export function nextMonthlyReset(): string {
  const now = new Date(Date.now() + 3600_000);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 3600_000);
  return next.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export async function toolkitTier(profileId: string, admin?: any): Promise<ToolkitTier> {
  return (await isEliteVerified(profileId, admin)) ? "elite" : "subscriber";
}

export type ToolkitUsage = {
  tier: ToolkitTier;
  monthly: { used: number; limit: number; left: number };
  daily: { used: number; limit: number; left: number };
  /** What each tool costs, so the interface can say "3 credits" on a button. */
  weights: Record<string, number>;
  resetsOn: string;
};

/**
 * What this person has spent and has left. Read only: nothing here consumes.
 */
export async function toolkitUsage(profileId: string): Promise<ToolkitUsage> {
  const admin = createAdminClient();
  const [settings, tier] = await Promise.all([eliteSettings(), toolkitTier(profileId, admin)]);
  const allowance = settings.toolkit_credits[tier];

  const [{ data: monthRuns }, { data: dayRuns }] = await Promise.all([
    admin.from("ai_runs").select("cost").eq("profile_id", profileId).gte("created_at", lagosMonthStart()),
    admin.from("ai_runs").select("cost").eq("profile_id", profileId).gte("created_at", lagosDayStart())
  ]);

  const spend = (rows: any[] | null) =>
    (rows ?? []).reduce((sum, r) => sum + (Number(r.cost) > 0 ? Number(r.cost) : 1), 0);

  const monthUsed = spend(monthRuns);
  const dayUsed = spend(dayRuns);

  return {
    tier,
    monthly: { used: monthUsed, limit: allowance.monthly, left: Math.max(0, allowance.monthly - monthUsed) },
    daily: { used: dayUsed, limit: allowance.daily, left: Math.max(0, allowance.daily - dayUsed) },
    weights: settings.toolkit_weights,
    resetsOn: nextMonthlyReset()
  };
}

/** What one run of this tool costs. */
export async function toolCost(tool: string): Promise<number> {
  const settings = await eliteSettings();
  const db = TOOL_DB[tool] ?? tool;
  const w = Number(settings.toolkit_weights[db]);
  return Number.isFinite(w) && w > 0 ? Math.round(w) : 1;
}

/** Which tools does this profile currently have? */
export async function unlockedTools(profileId: string): Promise<{ all: boolean; tools: Set<string> }> {
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("subscriptions")
    .select("plan_id, status, current_period_end")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString());
  const planIds = Array.from(new Set((subs ?? []).map((s) => s.plan_id).filter(Boolean)));
  if (planIds.length === 0) return { all: false, tools: new Set() };
  const { data: plans } = await admin.from("plans").select("id, tools").in("id", planIds);
  const tools = new Set<string>();
  for (const p of plans ?? []) {
    if (p.tools == null) return { all: true, tools };
    for (const t of p.tools as string[]) tools.add(t);
  }
  return { all: false, tools };
}

export async function requireSubscriber(tool?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, supabase, error: "Not signed in", status: 401 as const, cost: 0, runId: null };

  const u = await unlockedTools(user.id);
  const ok = u.all || (tool ? u.tools.has(tool) : u.tools.size > 0);
  if (!ok)
    return { user, supabase, cost: 0, runId: null, error: tool
      ? "This tool isn't on your current plan — unlock it individually or grab the full Career Toolkit."
      : "Subscription required — unlock the Career Toolkit to use this tool.", status: 402 as const };

  if (!tool || !TOOL_DB[tool]) return { user, supabase, error: null, status: 200 as const, cost: 1, runId: null };

  /**
   * CHECKING THE BUDGET AND SPENDING IT ARE ONE STATEMENT.
   *
   * Reading the balance, deciding there was room, calling the model and only
   * then writing the ledger row left a gap the width of a model call. Twenty
   * requests fired together all read the same balance, all passed, and an
   * allowance of sixty credits bought a hundred and eighty. The check was in
   * the right place and still bought nothing.
   *
   * ai_credits_spend, added in migration 0064, takes a lock on the person,
   * sums the month and the day, and writes the row only if both fit. No room
   * means no row and no id, and nothing reaches the model.
   */
  const admin = createAdminClient();
  const [settings, tier] = await Promise.all([eliteSettings(), toolkitTier(user.id, admin)]);
  const allowance = settings.toolkit_credits[tier];
  const cost = await toolCost(tool);

  const { data: runId, error: spendError } = await admin.rpc("ai_credits_spend", {
    p_profile: user.id,
    p_tool: TOOL_DB[tool],
    p_cost: cost,
    p_monthly_cap: allowance.monthly,
    p_daily_cap: allowance.daily,
    p_month_start: lagosMonthStart(),
    p_day_start: lagosDayStart()
  });

  /**
   * A missing function means migration 0064 has not been run.
   *
   * This fails CLOSED, unlike the rate limiter. A rate limiter that fails
   * open lets through traffic; a credit gate that fails open spends money on
   * every request, with nothing recording that it did.
   */
  if (spendError) {
    console.error("[ai-gate] credit spend could not be recorded:", spendError.message);
    return {
      user, supabase, cost, runId: null, status: 503 as const,
      error: "The toolkit is briefly unavailable. Nothing has been charged against your credits."
    };
  }

  if (!runId) {
    const usage = await toolkitUsage(user.id);
    if (usage.daily.left < cost && usage.monthly.left >= cost)
      return {
        user, supabase, cost, runId: null, status: 429 as const,
        error: `That is ${usage.daily.limit} credits today, which is the daily ceiling. It is there so one afternoon cannot spend the whole month. Your daily credits reset at midnight and you still have ${usage.monthly.left} this month.`
      };
    return {
      user, supabase, cost, runId: null, status: 429 as const,
      error: `You have ${usage.monthly.left} of your ${usage.monthly.limit} monthly toolkit credits left, and this run costs ${cost}. Your credits refill on ${usage.resetsOn}.`
        + (usage.tier === "subscriber" ? " Elite members get a larger allowance." : "")
    };
  }

  // The credit is now spent and the row exists. The route fills in the
  // output; a run that fails still cost the credit, which is honest, because
  // the model was called either way.
  return { user, supabase, error: null, status: 200 as const, cost, runId: runId as string };
}

/**
 * Fill in the reserved row once the generation is back.
 *
 * Never creates a row: if the reservation is missing the credit was never
 * taken, and inserting here would be a free run.
 */
export async function recordRun(
  runId: string | null,
  patch: { input?: any; output?: any; model?: string | null; tokens_in?: number | null; tokens_out?: number | null }
): Promise<void> {
  if (!runId) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_runs").update({
      input: patch.input ?? {},
      output: patch.output ?? null,
      model: patch.model ?? "gemini",
      tokens_in: patch.tokens_in ?? null,
      tokens_out: patch.tokens_out ?? null
    }).eq("id", runId);
    if (error) console.error("[ai-gate] could not attach the run output:", error.message);
  } catch (e: any) {
    console.error("[ai-gate] could not attach the run output:", e?.message ?? e);
  }
}
