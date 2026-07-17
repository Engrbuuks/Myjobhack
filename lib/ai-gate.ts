import { createClient } from "@/lib/supabase/server";
import { hasActiveSubscription } from "@/lib/subscription";

export async function requireSubscriber() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, supabase, error: "Not signed in", status: 401 as const };
  const active = await hasActiveSubscription(user.id);
  if (!active)
    return { user, supabase, error: "Subscription required — unlock the AI toolkit to use this tool.", status: 402 as const };
  return { user, supabase, error: null, status: 200 as const };
}
