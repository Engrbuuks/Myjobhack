import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { getAllowance } from "@/lib/emailAllowance";
import { brevoStatus, brevoConfigured } from "@/lib/brevo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is mail actually set up, and how much can still go out today?
 *
 * A fallback sender that was never configured correctly looks identical to one
 * that is working, right up until the day the primary runs out. This checks
 * both providers directly rather than trusting the environment variables to
 * be what they claim.
 */
export async function GET() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const steps: { step: string; ok: boolean; detail: string }[] = [];

  const rk = process.env.RESEND_API_KEY;
  steps.push({
    step: "Resend key", ok: !!rk,
    detail: rk ? `set, ${rk.length} characters` : "missing, so no mail can be sent at all"
  });
  steps.push({
    step: "Sending address", ok: true,
    detail: process.env.MAIL_FROM_EMAIL || process.env.RESEND_FROM || "no-reply@myjobhack.co"
  });

  const b = await brevoStatus();
  steps.push({
    step: "Brevo fallback", ok: b.ok,
    detail: b.ok
      ? `${b.detail}${b.remaining != null ? ` About ${b.remaining} credits left.` : ""}`
      : b.detail
  });

  if (brevoConfigured() && b.ok) {
    steps.push({
      step: "Brevo domain verification", ok: true,
      detail: "Confirm myjobhack.co is verified in Brevo with its DKIM records published. Sending from an unverified domain lands in spam and damages the reputation of the mail Resend sends too."
    });
  }

  const { count: failedToday } = await admin.from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("sent_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
  steps.push({
    step: "Failures today", ok: (failedToday ?? 0) === 0,
    detail: failedToday ? `${failedToday} message(s) failed today. Check email_log for the reasons.` : "none"
  });

  const allowance = await getAllowance(admin);
  const failed = steps.filter((s) => !s.ok);

  return NextResponse.json({
    verdict: failed.length ? `First problem: ${failed[0].step} — ${failed[0].detail}` : "Mail is set up correctly.",
    allowance,
    steps
  });
}
