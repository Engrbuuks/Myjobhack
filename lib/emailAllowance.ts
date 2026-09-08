/**
 * The daily send allowance, enforced in one place.
 *
 * Every bulk feature needs the same three things — know what's left, never
 * exceed it, record what went out — and each one reimplementing that is how
 * they drift apart. The applicant emailer capped nothing at all, so a single
 * click could spend the whole day's allowance and leave application receipts
 * failing silently for hours.
 */

/**
 * Resend's free tier allows 100 messages a day across the whole account.
 * The cap sits at 90 so receipts, invites and answer requests keep working
 * after a bulk send — spending the last ten on marketing would break the mail
 * people actually need.
 */
/**
 * Resend's free tier allows 100 a day. The cap sits at 90 so receipts,
 * invites and answer requests keep working after a bulk send.
 */
export const RESEND_CAP = Number(process.env.EMAIL_DAILY_CAP) || 90;

/**
 * Brevo's free tier allows 300 a day. Held slightly under, for the same
 * reason. Only counted when a Brevo key is actually configured, so the
 * number shown is capacity that exists rather than capacity you might have.
 */
export const BREVO_CAP = Number(process.env.BREVO_DAILY_CAP) || 280;

export const DAILY_CAP = RESEND_CAP;

export type Allowance = {
  cap: number;
  sent_today: number;
  remaining: number;
  resets_at: string;
  /** Per provider, so it is clear where the remaining capacity actually is. */
  providers: { name: string; cap: number; sent: number; remaining: number; configured: boolean }[];
};

export async function getAllowance(admin: any): Promise<Allowance> {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const { count } = await admin.from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("kind", "bulk").eq("status", "sent")
    .gte("sent_at", midnight.toISOString());

  const tomorrow = new Date(midnight); tomorrow.setDate(tomorrow.getDate() + 1);
  const sent = count ?? 0;

  // Split by provider so the figure reflects real headroom on each.
  const { data: rows } = await admin.from("email_log")
    .select("provider")
    .eq("kind", "bulk").eq("status", "sent")
    .gte("sent_at", midnight.toISOString());

  const byProvider = (rows ?? []).reduce((acc: Record<string, number>, r: any) => {
    const p = r.provider ?? "resend";
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  const brevoOn = !!process.env.BREVO_API_KEY;
  const providers = [
    { name: "resend", cap: RESEND_CAP, sent: byProvider.resend ?? 0,
      remaining: Math.max(0, RESEND_CAP - (byProvider.resend ?? 0)), configured: true },
    { name: "brevo", cap: brevoOn ? BREVO_CAP : 0, sent: byProvider.brevo ?? 0,
      remaining: brevoOn ? Math.max(0, BREVO_CAP - (byProvider.brevo ?? 0)) : 0, configured: brevoOn }
  ];

  const totalCap = providers.reduce((n, p) => n + p.cap, 0);
  const totalRemaining = providers.reduce((n, p) => n + p.remaining, 0);

  return {
    cap: totalCap,
    sent_today: sent,
    remaining: totalRemaining,
    resets_at: tomorrow.toISOString(),
    providers
  };
}

/** Addresses that have opted out, lowercased. Never email these. */
export async function getOptOuts(admin: any, emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const { data } = await admin.from("email_optouts")
    .select("email").not("opted_out_at", "is", null)
    .in("email", emails.map((e) => e.toLowerCase()));
  return new Set((data ?? []).map((r: any) => r.email.toLowerCase()));
}

/**
 * A per-address unsubscribe token, created on demand.
 *
 * Guest applicants have no account, so the old link to /portal/account led
 * them to a login wall. A recipient who cannot unsubscribe marks the message
 * as spam instead — and that harms deliverability for every message the
 * platform sends, including the transactional ones.
 */
export async function unsubscribeUrlFor(admin: any, email: string): Promise<string> {
  const app = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const lower = email.toLowerCase();

  const { data: existing } = await admin.from("email_optouts")
    .select("token").eq("email", lower).maybeSingle();
  if (existing?.token) return `${app}/unsubscribe/${existing.token}`;

  const { data: created } = await admin.from("email_optouts")
    .insert({ email: lower }).select("token").single();
  return created?.token ? `${app}/unsubscribe/${created.token}` : `${app}/unsubscribe`;
}

/** Record what was sent. Failures are logged too — that is the useful half. */
export async function logSends(admin: any, rows: {
  recipient: string; subject: string; kind?: string;
  job_id?: string | null; application_id?: string | null; profile_id?: string | null;
  sent_by?: string | null; status: "sent" | "failed"; error?: string | null; preview?: string;
  provider?: string;
}[]) {
  if (!rows.length) return;
  await admin.from("email_log").insert(rows.map((r) => ({
    ...r,
    kind: r.kind ?? "bulk",
    provider: r.provider ?? "resend",
    preview: (r.preview ?? "").slice(0, 300)
  })));
}
