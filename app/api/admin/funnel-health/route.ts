import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Why hasn't the funnel sent anything?
 * There are several plausible causes and guessing wastes time — this reports
 * which one it actually is.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const r: any = { checked_at: new Date().toISOString(), causes: [] as string[] };

  // 1 · Is email even configured?
  r.resend_key_set = !!process.env.RESEND_API_KEY;
  if (!r.resend_key_set) r.causes.push("RESEND_API_KEY is not set — no email can send at all.");

  // 2 · Is the funnel switched off?
  const { data: cfg } = await admin.from("app_settings").select("value").eq("key", "funnel").maybeSingle();
  r.funnel_enabled = (cfg?.value as any)?.enabled !== false;
  if (!r.funnel_enabled) r.causes.push("The funnel is disabled in settings (app_settings.funnel.enabled = false).");

  // 3 · Is CRON_SECRET set? If so, Vercel must send it or every run 401s.
  r.cron_secret_set = !!process.env.CRON_SECRET;
  if (r.cron_secret_set) {
    r.causes.push("CRON_SECRET is set. Vercel Cron does NOT send an Authorization header by default — if it isn't configured to, every run is rejected with 401 and nothing sends. This is the most common cause.");
  }

  // 4 · Is anyone actually eligible? Drips target day 1-3, 3-5, 7-9, 14-16, 21-60.
  const now = Date.now();
  const windows = [["d1_profile",1,3],["d3_resume",3,5],["d7_toolkit",7,9],["d14_apply",14,16],["d21_lastcall",21,60]] as const;
  r.eligibility = [];
  for (const [step, min, max] of windows) {
    const newest = new Date(now - min * 864e5).toISOString();
    const oldest = new Date(now - max * 864e5).toISOString();
    const { count } = await admin.from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["job_seeker", "elite_member"])
      .gte("created_at", oldest).lte("created_at", newest)
      .neq("funnel_status", "dormant");
    r.eligibility.push({ step, window_days: `${min}-${max}`, people_in_window: count ?? 0 });
  }
  const anyEligible = r.eligibility.some((e: any) => e.people_in_window > 0);
  if (!anyEligible) {
    r.causes.push("Nobody currently falls inside any drip window. With few signups, everyone may have passed day 60 or be younger than day 1.");
  }

  // 5 · Has it ever recorded a send?
  const { count: everSent } = await admin.from("funnel_emails")
    .select("id", { count: "exact", head: true });
  r.emails_ever_sent = everSent ?? 0;

  // 6 · Total seekers, for context.
  const { count: seekers } = await admin.from("profiles")
    .select("id", { count: "exact", head: true }).in("role", ["job_seeker", "elite_member"]);
  r.total_seekers = seekers ?? 0;

  r.verdict = r.causes.length
    ? r.causes[0]
    : "No blocking cause found. The next scheduled run should send — check Vercel's cron logs to confirm it is firing.";

  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
