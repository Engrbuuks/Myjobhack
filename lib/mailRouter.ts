/**
 * One place that decides which provider sends a message.
 *
 * Resend stays primary because the domain's sending reputation is built there.
 * Brevo picks up only what Resend cannot deliver, so the two free tiers add up
 * (roughly 100 plus 300) instead of the smaller one being a hard ceiling.
 *
 * IMPORTANT DISTINCTION: a failed send is not automatically retried elsewhere.
 * "Invalid recipient" or "blocked address" will fail identically on any
 * provider, and retrying just burns the fallback's quota for nothing. Only
 * capacity and availability errors trigger failover.
 */
import { sendBatch as sendViaResend, htmlToText } from "@/lib/resend";
import { sendViaBrevo, isCapacityError, brevoConfigured, type SendResult, type MailMessage } from "@/lib/brevo";

export type RoutedResult = SendResult & { provider: "resend" | "brevo" | "none" };

export type RouteOpts = {
  bulk?: boolean;
  unsubscribeUrl?: string;
  chunkSize?: number;
  pauseMs?: number;
  /** Skip Resend entirely, for testing the fallback path. */
  forceProvider?: "resend" | "brevo";
};

/**
 * Send, falling back per message rather than per batch.
 *
 * Per message matters: if Resend accepts forty of fifty and then hits its
 * daily limit, only the last ten should move to Brevo. Failing the whole
 * batch over would send forty duplicates.
 */
export async function routeMail(
  emails: MailMessage[], opts: RouteOpts = {}
): Promise<RoutedResult[]> {
  if (!emails.length) return [];

  const withText = emails.map((e) => ({ ...e, text: e.text ?? htmlToText(e.html) }));

  if (opts.forceProvider === "brevo") {
    const r = await sendViaBrevo(withText, { bulk: opts.bulk });
    return r.map((x) => ({ ...x, provider: "brevo" as const }));
  }

  const primary = await sendViaResend(withText as any, {
    bulk: opts.bulk, unsubscribeUrl: opts.unsubscribeUrl,
    chunkSize: opts.chunkSize, pauseMs: opts.pauseMs
  });

  const out: RoutedResult[] = primary.map((r) => ({ ...r, provider: "resend" as const }));

  // Which ones failed for a reason a second provider could actually solve?
  const retryIdx = out
    .map((r, i) => (r.error && isCapacityError(r.error) ? i : -1))
    .filter((i) => i >= 0);

  if (!retryIdx.length || !brevoConfigured()) return out;

  const retryMsgs = retryIdx.map((i) => withText[i]);
  const second = await sendViaBrevo(retryMsgs, { bulk: opts.bulk });

  retryIdx.forEach((originalIndex, k) => {
    const r = second[k];
    out[originalIndex] = r.error
      // Both failed. Report both, so the log is not misleading about why.
      ? { id: null, error: `Resend: ${out[originalIndex].error} | Brevo: ${r.error}`, provider: "brevo" }
      : { id: r.id, error: null, provider: "brevo" };
  });

  return out;
}

/** Single message convenience wrapper. */
export async function routeOne(
  to: string, subject: string, html: string, opts: RouteOpts = {}
): Promise<RoutedResult> {
  const [r] = await routeMail([{ to, subject, html, unsubscribeUrl: opts.unsubscribeUrl }], opts);
  return r;
}

/** For the send report: how many went by each route. */
export function summariseRouting(results: RoutedResult[]): {
  sent: number; failed: number; via_resend: number; via_brevo: number; note: string;
} {
  const sent = results.filter((r) => !r.error).length;
  const failed = results.length - sent;
  const via_resend = results.filter((r) => !r.error && r.provider === "resend").length;
  const via_brevo = results.filter((r) => !r.error && r.provider === "brevo").length;
  return {
    sent, failed, via_resend, via_brevo,
    note: via_brevo
      ? `${via_brevo} sent through Brevo after Resend reached its limit.`
      : ""
  };
}
