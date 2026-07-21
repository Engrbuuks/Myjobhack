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
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { kind, id, data } = await request.json();

  if (kind === "seeker_plan") {
    await admin.from("plans").update(data).eq("id", id);
  } else if (kind === "employer_plan") {
    await admin.from("employer_plans").update(data).eq("id", id);
  } else if (kind === "training") {
    await admin.from("trainings").update(data).eq("id", id);
  } else if (kind === "loose") {
    const { data: existing } = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
    const merged = { ...(existing?.value ?? {}), ...data };
    await admin.from("app_settings").upsert({ key: "pricing", value: merged }, { onConflict: "key" });
  } else {
    return NextResponse.json({ error: "Unknown pricing kind" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
