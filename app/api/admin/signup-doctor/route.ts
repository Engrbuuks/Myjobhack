import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnose registration problems. STAFF ONLY.
 * Open https://app.myjobhack.co/api/admin/signup-doctor while signed in as staff.
 * Reports whether auth users are being created, whether each one got a
 * profile row, and where the chain is breaking.
 *
 * WHY IT MOVED OFF /api/public: middleware treats the whole /api/public prefix
 * as public, so this was readable by anyone on the internet, and it listed the
 * email address of every recent registration. It now sits behind
 * settings.manage, and addresses are redacted even for the staff who pass the
 * gate, because the question this endpoint answers is "did the chain run",
 * which the counts and the flags already answer.
 */

/** Enough of an address to recognise an account, not enough to mail it. */
function redactEmail(email: string | null | undefined): string {
  if (!email) return "none on record";
  const at = email.indexOf("@");
  if (at < 1) return "malformed";
  return `${email[0]}***${email.slice(at)}`;
}

export async function GET() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const report: any = { checked_at: new Date().toISOString() };

  // Are the public env vars present in this deployment? A missing anon key
  // makes the browser client fail with an error that stringifies to "{}".
  // Presence only. A key value is never printed, gate or no gate.
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
    // Driver text can name columns, roles and connection details, so it goes
    // to the server log and the caller gets a stable sentence.
    console.error("[signup-doctor] cannot read auth users:", authErr.message);
    report.fatal = "Cannot read auth users. The reason is in the server logs.";
    return NextResponse.json(report, { status: 500 });
  }
  const users = userList?.users ?? [];
  report.auth_users = {
    total_recent: users.length,
    confirmed: users.filter((u) => !!u.email_confirmed_at).length,
    unconfirmed: users.filter((u) => !u.email_confirmed_at).length
  };

  // 2 · Profiles — the trigger should have made one per user.
  // Addresses are not selected: nothing below reports them.
  const { data: profiles, error: pErr } = await admin
    .from("profiles").select("id, full_name, role, created_at")
    .order("created_at", { ascending: false }).limit(20);
  if (pErr) console.error("[signup-doctor] cannot read profiles:", pErr.message);
  report.profiles = pErr
    ? "ERROR: cannot read the profiles table. The reason is in the server logs."
    : { total_recent: profiles?.length ?? 0 };

  // 3 · Cross-check: any auth user without a profile means the trigger failed
  const profileIds = new Set((profiles ?? []).map((p) => p.id));
  const orphans = users.filter((u) => !profileIds.has(u.id));
  report.users_without_profile = orphans.map((u) => ({
    email: redactEmail(u.email),
    created: u.created_at,
    confirmed: !!u.email_confirmed_at
  }));

  // 4 · Recent registrations, newest first
  report.recent_signups = users
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map((u) => ({
      email: redactEmail(u.email),
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
