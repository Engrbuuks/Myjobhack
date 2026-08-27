import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { quotaFor, usedBytes, humanBytes } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role ?? "job_seeker";

  const [quota, used] = await Promise.all([quotaFor(role), usedBytes(user.id)]);
  return NextResponse.json({
    used, quota, pct: quota ? Math.min(100, Math.round((used / quota) * 100)) : 0,
    used_label: humanBytes(used), quota_label: humanBytes(quota)
  });
}
