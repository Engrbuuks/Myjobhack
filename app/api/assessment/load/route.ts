import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { assessment_id } = await request.json();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: a } = await admin.from("assessments")
    .select("id, talent_id, status, questions, time_limit_min, field_label, job_id")
    .eq("id", assessment_id).maybeSingle();
  if (!a || a.talent_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["generated", "in_progress"].includes(a.status))
    return NextResponse.json({ error: "This assessment is already submitted." }, { status: 409 });

  // Mark in-progress + strip rubrics before sending to the client.
  await admin.from("assessments").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", a.id);
  const questions = (a.questions as any[]).map((q) => ({
    id: q.id, type: q.type, prompt: q.prompt, options: q.options, minutes: q.minutes, max_points: q.max_points
  }));
  return NextResponse.json({ id: a.id, questions, time_limit_min: a.time_limit_min, field_label: a.field_label });
}
