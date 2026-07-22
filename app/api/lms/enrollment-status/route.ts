import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Trainer (or admin) moves a learner through the enrollment pipeline. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["trainer", "admin"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { enrollment_id, status } = await request.json();
  const ALLOWED = ["invited", "registered", "attended", "completed", "dropped"];
  if (!ALLOWED.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  // A trainer may only touch enrollments on their own trainings.
  if (me?.role === "trainer") {
    const { data: e } = await admin.from("enrollments").select("training_id").eq("id", enrollment_id).maybeSingle();
    if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: t } = await admin.from("trainings").select("trainer_id").eq("id", e.training_id).maybeSingle();
    if (t?.trainer_id !== user.id) return NextResponse.json({ error: "Not your training" }, { status: 403 });
  }

  const patch: any = { status };
  if (status === "attended") patch.attended_at = new Date().toISOString();
  if (status === "completed") patch.completed_at = new Date().toISOString();

  const { error } = await admin.from("enrollments").update(patch).eq("id", enrollment_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
