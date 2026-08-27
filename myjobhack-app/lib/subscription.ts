import { createAdminClient } from "@/lib/supabase/admin";

export async function hasActiveSubscription(profileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

/** Activate (or extend) a subscription for `days`. Returns subscription id. */
export async function activateSubscription(
  profileId: string, planId: string, method: string, days = 30
): Promise<string> {
  const admin = createAdminClient();
  const now = new Date();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, current_period_end, status")
    .eq("profile_id", profileId)
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // extend from current end if still active, else from now
  const base = existing?.status === "active" && existing.current_period_end &&
    new Date(existing.current_period_end) > now
      ? new Date(existing.current_period_end) : now;
  const end = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  if (existing) {
    await admin.from("subscriptions").update({
      status: "active", method: method as any,
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString()
    }).eq("id", existing.id);
    return existing.id;
  }
  const { data: created } = await admin.from("subscriptions").insert({
    profile_id: profileId, plan_id: planId, status: "active", method: method as any,
    current_period_start: now.toISOString(), current_period_end: end.toISOString()
  }).select("id").single();
  return created!.id;
}

export async function markPendingSubscription(profileId: string, planId: string, method: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions").select("id, status")
    .eq("profile_id", profileId).eq("plan_id", planId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    if (existing.status !== "active") {
      await admin.from("subscriptions")
        .update({ status: "pending_confirmation", method: method as any }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: created } = await admin.from("subscriptions").insert({
    profile_id: profileId, plan_id: planId, status: "pending_confirmation", method: method as any
  }).select("id").single();
  return created!.id;
}
