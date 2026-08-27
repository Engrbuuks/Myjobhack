import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const TOOL_DB: Record<string, string> = {
  "resume-review": "resume_review",
  "interview-prep": "interview_prep",
  "skills-gap": "skills_gap"
};
const DEFAULT_LIMITS: Record<string, number> = { "resume-review": 5, "interview-prep": 1, "skills-gap": 3 };

/** Start of "today" in Africa/Lagos (WAT, UTC+1) — the reset users are promised. */
function lagosDayStart(): string {
  const now = new Date(Date.now() + 3600_000);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3600_000;
  return new Date(start).toISOString();
}

export async function toolkitLimits(): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "toolkit_limits").maybeSingle();
  return { ...DEFAULT_LIMITS, ...((data?.value as any) ?? {}) };
}

export async function toolkitUsage(profileId: string): Promise<Record<string, { used: number; limit: number }>> {
  const admin = createAdminClient();
  const limits = await toolkitLimits();
  const { data: runs } = await admin.from("ai_runs")
    .select("tool").eq("profile_id", profileId).gte("created_at", lagosDayStart());
  const counts = new Map<string, number>();
  (runs ?? []).forEach((r) => counts.set(r.tool, (counts.get(r.tool) ?? 0) + 1));
  const out: Record<string, { used: number; limit: number }> = {};
  for (const [slug, db] of Object.entries(TOOL_DB)) {
    out[slug] = { used: counts.get(db) ?? 0, limit: limits[slug] ?? 0 };
  }
  return out;
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
  if (!user) return { user: null, supabase, error: "Not signed in", status: 401 as const };

  const u = await unlockedTools(user.id);
  const ok = u.all || (tool ? u.tools.has(tool) : u.tools.size > 0);
  if (!ok)
    return { user, supabase, error: tool
      ? "This tool isn't on your current plan — unlock it individually or grab the full Career Toolkit."
      : "Subscription required — unlock the Career Toolkit to use this tool.", status: 402 as const };

  // fair-use: per-user daily cap, enforced BEFORE any model call is spent
  if (tool && TOOL_DB[tool]) {
    const limits = await toolkitLimits();
    const limit = limits[tool] ?? 0;
    if (limit <= 0)
      return { user, supabase, error: "This tool is temporarily paused by the team.", status: 403 as const };
    const admin = createAdminClient();
    const { count } = await admin.from("ai_runs")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", user.id).eq("tool", TOOL_DB[tool])
      .gte("created_at", lagosDayStart());
    if ((count ?? 0) >= limit)
      return { user, supabase,
        error: `You've used today's ${limit} ${limit === 1 ? "run" : "runs"} of this tool. Your allowance resets at midnight — it exists so the Toolkit stays fast and personal for every member.`,
        status: 429 as const };
  }
  return { user, supabase, error: null, status: 200 as const };
}
