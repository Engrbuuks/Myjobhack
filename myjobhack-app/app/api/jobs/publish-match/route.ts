import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchJobToPool } from "@/lib/proactiveMatch";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Match a newly published job against the pool.
 *
 * This is the highest-value, lowest-cost moment to match: a new posting is the
 * only thing that has genuinely changed, so we compute once rather than
 * re-scanning the whole pool nightly.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { job_id } = await request.json();
  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const result = await matchJobToPool(job_id);
  return NextResponse.json({
    ok: true, matched: result.matched,
    message: result.matched
      ? `Matched against ${result.matched} assessed candidates. Strong matches will be notified.`
      : "No assessed candidates in this field yet."
  });
}
