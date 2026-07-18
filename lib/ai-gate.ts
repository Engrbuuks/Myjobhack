import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Which AI tools does this profile currently have? Returns { all } or { tools:Set }. */
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
    if (p.tools == null) return { all: true, tools };   // combo plan unlocks everything
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
      ? "This tool isn't on your current plan — unlock it individually or grab the full toolkit."
      : "Subscription required — unlock the AI toolkit to use this tool.", status: 402 as const };
  return { user, supabase, error: null, status: 200 as const };
}
