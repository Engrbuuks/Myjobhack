import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

/** Shows what a code is worth before the user commits to paying. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code, training_id } = await request.json();
  const admin = createAdminClient();
  const { data: t } = await admin.from("trainings").select("id, price_ngn").eq("id", training_id).maybeSingle();
  if (!t) return NextResponse.json({ error: "Training not found." }, { status: 404 });

  const result = await validateCoupon({
    code, training_id: t.id, profile_id: user.id, amount: Number(t.price_ngn)
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
