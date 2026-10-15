import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/pricing";

export const runtime = "nodejs";

/** Upgrade an Elite member to the premium tier (toolkit + unlimited assessments). */
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: mem } = await admin.from("elite_memberships")
    .select("id, status, tier, perks").eq("talent_id", user.id).maybeSingle();

  /**
   * Choosing premium is not buying it.
   *
   * This wrote tier "premium" and the full perks object before a naira moved,
   * which is the entitlement itself: anyone who could reach this route had the
   * paid tier on their record. The intent is recorded as pending and nothing
   * else changes. Payment settlement is what promotes the membership, the same
   * way every other purchase on the platform is granted.
   */
  if (mem) {
    await admin.from("elite_memberships").update({
      perks: {
        ...((mem.perks as Record<string, any>) ?? {}),
        pending_tier: "premium",
        pending_since: new Date().toISOString()
      }
    }).eq("id", mem.id);
  }

  const pricing = await getPricing();
  return NextResponse.json({
    ok: true,
    message: `Premium selected — transfer ₦${pricing.elite_premium_ngn.toLocaleString()} on the Payments page to activate your toolkit access and unlimited assessments.`
  });
}
