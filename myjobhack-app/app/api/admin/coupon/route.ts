import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { action, id, data } = await request.json();

  if (action === "create") {
    const code = String(data?.code ?? "").trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "A code is required." }, { status: 400 });
    const value = Number(data?.value);
    if (!value || value <= 0) return NextResponse.json({ error: "Enter a discount value above zero." }, { status: 400 });
    if (data?.kind === "percent" && value > 100)
      return NextResponse.json({ error: "A percentage discount can't exceed 100." }, { status: 400 });

    const { data: created, error } = await admin.from("coupons").insert({
      code, label: data.label || null, kind: data.kind === "amount" ? "amount" : "percent",
      value, training_id: data.training_id || null,
      max_redemptions: data.max_redemptions ? Number(data.max_redemptions) : null,
      max_per_user: Number(data.max_per_user) || 1,
      min_amount_ngn: Number(data.min_amount_ngn) || 0,
      starts_at: data.starts_at || null, expires_at: data.expires_at || null,
      created_by: user.id
    }).select().single();

    if (error) {
      const msg = error.message.includes("duplicate")
        ? "That code already exists for this scope."
        : `Could not create the coupon: ${error.message}`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ ok: true, coupon: created });
  }

  if (action === "toggle") {
    const { data: cur } = await admin.from("coupons").select("active").eq("id", id).single();
    const { error } = await admin.from("coupons").update({ active: !cur?.active }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { error } = await admin.from("coupons").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
