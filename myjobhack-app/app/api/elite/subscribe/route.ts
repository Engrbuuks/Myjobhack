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
  const { data: mem } = await admin.from("elite_memberships").select("id, status").eq("talent_id", user.id).maybeSingle();

  // Record intent; activation follows payment confirmation (bank/Paystack), like other billing.
  if (mem) {
    await admin.from("elite_memberships").update({
      tier: "premium",
      perks: { toolkit: true, unlimited_assessments: true, priority: true }
    }).eq("id", mem.id);
  }

  const pricing = await getPricing();
  return NextResponse.json({
    ok: true,
    message: `Premium selected — transfer ₦${pricing.elite_premium_ngn.toLocaleString()} on the Payments page to activate your toolkit access and unlimited assessments.`
  });
}
