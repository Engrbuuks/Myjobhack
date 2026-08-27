import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slug(kind: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  const prefix = kind === "elite" ? "elite" : kind === "employer" ? "hire" : "join";
  return `${prefix}-${rand}`;
}

/** A partner creates their own referral link (tracked against them). */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["partner", "admin"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Partners only" }, { status: 403 });

  const { kind, label } = await request.json();
  const k = ["talent", "elite", "employer"].includes(kind) ? kind : "talent";

  let code = slug(k);
  for (let i = 0; i < 5; i++) {
    const { data: exists } = await admin.from("invite_links").select("id").eq("code", code).maybeSingle();
    if (!exists) break;
    code = slug(k);
  }

  const { data, error } = await admin.from("invite_links")
    .insert({ code, kind: k, label: label || null, created_by: user.id, partner_id: user.id })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, link: data });
}
