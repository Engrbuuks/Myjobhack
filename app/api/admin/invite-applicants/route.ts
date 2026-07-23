import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteApplicantsToPool } from "@/lib/applicantInvites";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Run the applicant-to-pool invite immediately, rather than waiting for the cron. */
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const r = await inviteApplicantsToPool();
  return NextResponse.json({
    ok: true, ...r,
    message: r.error
      ? r.error
      : `${r.invited} applicant${r.invited === 1 ? "" : "s"} invited to join the pool.` +
        (r.skipped_existing ? ` ${r.skipped_existing} already had accounts.` : "")
  });
}
