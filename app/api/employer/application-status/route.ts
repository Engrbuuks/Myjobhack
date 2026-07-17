import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, status } = await request.json();
  const ALLOWED = ["submitted", "shortlisted", "interviewing", "offered", "hired", "rejected"];
  if (!id || !ALLOWED.includes(status))
    return NextResponse.json({ error: "id and valid status required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: app } = await admin.from("applications").select("id, job_id").eq("id", id).single();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: job } = await admin.from("jobs").select("org_id").eq("id", app.job_id).single();
  if (!job?.org_id) return NextResponse.json({ error: "Not an employer job" }, { status: 403 });

  const { data: membership } = await admin.from("org_members")
    .select("org_id").eq("org_id", job.org_id).eq("profile_id", user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not your organization" }, { status: 403 });

  await admin.from("applications")
    .update({ status: status as any, reviewed_by: user.id }).eq("id", id);
  return NextResponse.json({ ok: true });
}
