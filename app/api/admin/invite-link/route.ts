import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slug(kind: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  const prefix = kind === "elite" ? "elite" : kind === "employer" ? "hire" : "join";
  return `${prefix}-${rand}`;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { action, id, kind, label } = await request.json();

  if (action === "create") {
    let code = slug(kind ?? "talent");
    // ensure uniqueness
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await admin.from("invite_links").select("id").eq("code", code).maybeSingle();
      if (!exists) break;
      code = slug(kind ?? "talent");
    }
    const { data, error } = await admin.from("invite_links")
      .insert({ code, kind: kind ?? "talent", label: label ?? null, created_by: user.id })
      .select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, link: data });
  }

  if (action === "toggle") {
    const { data: cur } = await admin.from("invite_links").select("active").eq("id", id).single();
    await admin.from("invite_links").update({ active: !cur?.active }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    await admin.from("invite_links").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
