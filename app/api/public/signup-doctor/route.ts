import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnose registration problems.
 * Open https://app.myjobhack.co/api/public/signup-doctor in a browser.
 * Reports whether auth users are being created, whether each one got a
 * profile row, and where the chain is breaking.
 */
export async function GET() {
  const admin = createAdminClient();
  const report: any = { checked_at: new Date().toISOString() };

  // Are the public env vars present in this deployment? A missing anon key
  // makes the browser client fail with an error that stringifies to "{}".
  const pubUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  report.browser_config = {
    NEXT_PUBLIC_SUPABASE_URL: pubUrl ? `${pubUrl.replace(/^https?:\/\//, "").split(".")[0]}.supabase.co` : "MISSING",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "present" : "MISSING",
    note: "If any read MISSING, set them in Vercel for Production and redeploy. Signup fails with an empty error when the anon key is absent."
  };

  // 1 · Auth users
  const { data: userList, error: authErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 20 });
  if (authErr) {
    report.fatal = `Cannot read auth users: ${authErr.message}`;
    return NextResponse.json(report, { status: 500 });
  }
  const users = userList?.users ?? [];
  report.auth_users = {
    total_recent: users.length,
    confirmed: users.filter((u) => !!u.email_confirmed_at).length,
    unconfirmed: users.filter((u) => !u.email_confirmed_at).length
  };

  // 2 · Profiles — the trigger should have made one per user
  const { data: profiles, error: pErr } = await admin
    .from("profiles").select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false }).limit(20);
  report.profiles = pErr ? `ERROR: ${pErr.message}` : { total_recent: profiles?.length ?? 0 };

  // 3 · Cross-check: any auth user without a profile means the trigger failed
  const profileIds = new Set((profiles ?? []).map((p) => p.id));
  const orphans = users.filter((u) => !profileIds.has(u.id));
  report.users_without_profile = orphans.map((u) => ({
    email: u.email,
    created: u.created_at,
    confirmed: !!u.email_confirmed_at
  }));

  // 4 · Recent registrations, newest first
  report.recent_signups = users
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map((u) => ({
      email: u.email,
      created: u.created_at,
      email_confirmed: !!u.email_confirmed_at,
      has_profile: profileIds.has(u.id),
      role: (u.user_metadata as any)?.role ?? "not set"
    }));

  // 5 · Verdict
  if (users.length === 0) {
    report.verdict =
      "No auth users at all. Either nobody has completed signup, or signUp is failing before a user is created. " +
      "Check Supabase → Authentication → Providers → Email is enabled, and that Site URL is set correctly.";
  } else if (orphans.length > 0) {
    report.verdict =
      `${orphans.length} user(s) exist in auth but have no profile row. The handle_new_user trigger is failing — ` +
      "this makes signup return 'Database error saving new user'. Check the trigger and the user_role enum values.";
  } else if (report.auth_users.unconfirmed > 0 && report.auth_users.confirmed === 0) {
    report.verdict =
      "Users are registering but none have confirmed their email. Confirmation emails are likely not being delivered. " +
      "Check Supabase → Authentication → Email templates, and configure custom SMTP (Resend) — the built-in service is rate limited to a few emails per hour.";
  } else {
    report.verdict = "Registration chain looks healthy: users are being created and profiles exist.";
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
