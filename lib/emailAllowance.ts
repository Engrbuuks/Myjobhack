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
export const DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP) || 90;

export type Allowance = {
  cap: number;
  sent_today: number;
  remaining: number;
  resets_at: string;
};

export async function getAllowance(admin: any): Promise<Allowance> {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const { count } = await admin.from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("kind", "bulk").eq("status", "sent")
    .gte("sent_at", midnight.toISOString());

  const tomorrow = new Date(midnight); tomorrow.setDate(tomorrow.getDate() + 1);
  const sent = count ?? 0;
  return {
    cap: DAILY_CAP,
    sent_today: sent,
    remaining: Math.max(0, DAILY_CAP - sent),
    resets_at: tomorrow.toISOString()
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
}[]) {
  if (!rows.length) return;
  await admin.from("email_log").insert(rows.map((r) => ({
    ...r,
    kind: r.kind ?? "bulk",
    preview: (r.preview ?? "").slice(0, 300)
  })));
}
