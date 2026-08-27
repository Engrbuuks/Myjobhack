import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Invite guest applicants to join the talent pool.
 *
 * These are the warmest people we ever touch — they applied to a real job, so
 * they want work now. Today they apply and vanish. This converts them into
 * assessed pool members, which is free supply from proven intent.
 *
 * Deliberately delayed by a day so the invite doesn't collide with the
 * application receipt, and each person is invited exactly once.
 */
export async function inviteApplicantsToPool(): Promise<{
  invited: number; skipped_existing: number; error?: string;
}> {
  const admin = createAdminClient();

  const { data: cfgRow } = await admin.from("app_settings")
    .select("value").eq("key", "applicant_invites").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as any;
  if (cfg.enabled === false) return { invited: 0, skipped_existing: 0, error: "Disabled in settings." };

  const delayHours = Number(cfg.delay_hours) || 24;
  const maxPerRun = Number(cfg.max_per_run) || 100;
  const cutoff = new Date(Date.now() - delayHours * 3600_000).toISOString();

  // Guest applications old enough to invite, never invited before.
  const { data: apps } = await admin.from("applications")
    .select("id, guest_email, guest_name, job_id, created_at")
    .not("guest_email", "is", null)
    .is("pool_invited_at", null)
    .lte("created_at", cutoff)
    .limit(maxPerRun);

  if (!apps?.length) return { invited: 0, skipped_existing: 0 };

  // One invite per person, even if they applied to several roles.
  const byEmail = new Map<string, any>();
  apps.forEach((a: any) => {
    const key = String(a.guest_email).toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, a);
  });

  let invited = 0, skipped = 0;

  for (const [email, app] of Array.from(byEmail.entries())) {
    // Already has an account? Nothing to invite them to.
    const { data: existing } = await admin.from("profiles")
      .select("id").ilike("email", email).maybeSingle();
    if (existing) {
      await admin.from("applications")
        .update({ pool_invited_at: new Date().toISOString(), pool_joined: true })
        .eq("guest_email", app.guest_email);
      skipped++;
      continue;
    }

    const { data: job } = await admin.from("jobs")
      .select("title, company_name").eq("id", app.job_id).maybeSingle();
    const first = (app.guest_name || "there").split(" ")[0];

    const html = renderEmail({
      kicker: "Join the pool",
      heading: "You applied — now let employers find you",
      paragraphs: [
        `Hi ${first},`,
        `You recently applied for ${job?.title ? `the ${job.title} role` : "a role"}${job?.company_name ? ` at ${job.company_name}` : ""} through MYJOBHACK. Whatever happens with that application, there's something worth doing while you're here.`,
        "Most people apply to jobs and wait. On MYJOBHACK you can do the opposite — take one practical assessment in your field, earn a competency band, and let employers come to you. They search our pool by proven ability, not by who happened to apply that week.",
        "It takes about two minutes to set up, and the assessment itself is around 35 minutes."
      ],
      bullets: [
        "Get matched to roles automatically — we email you when one fits",
        "Employers see what you can actually do, not just a CV claim",
        "Free to join, and free to be assessed"
      ],
      cta: { label: "Create my profile", url: `${APP()}/join?ref=applicant-invite` },
    });

    const res = await sendEmail(email, "You applied — now let employers find you", html, { bulk: true });
    if (!res.error) {
      // Mark every application from this person, so they're never asked twice.
      await admin.from("applications")
        .update({ pool_invited_at: new Date().toISOString() })
        .eq("guest_email", app.guest_email);
      invited++;
    }
  }

  return { invited, skipped_existing: skipped };
}
