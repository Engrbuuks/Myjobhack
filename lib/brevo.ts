/**
 * Brevo as a second sender, so a spent Resend allowance does not stop mail.
 *
 * WHY A FALLBACK AND NOT A REPLACEMENT: Resend carries the sending reputation
 * built up on this domain, so it stays the primary. Brevo takes over only when
 * Resend cannot deliver, which on the free tier means roughly 100 messages a
 * day. Brevo's own free tier is 300 a day, so the two together cover about
 * 400 rather than 100.
 *
 * WHAT YOU MUST DO OUTSIDE THE CODE: verify myjobhack.co in Brevo and publish
 * its DKIM records, exactly as you did for Resend. Sending from an unverified
 * domain through a second provider is a fast way to land in spam, and it drags
 * down the reputation of the mail Resend sends too.
 */

export type SendResult = { id: string | null; error: string | null };

export type MailMessage = {
  to: string; subject: string; html: string; text?: string;
  unsubscribeUrl?: string;
};

const FROM_NAME = process.env.MAIL_FROM_NAME || "MYJOBHACK";
const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "no-reply@myjobhack.co";
const REPLY_TO = process.env.RESEND_REPLY_TO || "hello@myjobhack.co";

export function brevoConfigured(): boolean {
  return !!process.env.BREVO_API_KEY;
}

/**
 * Errors that mean "this provider is out of capacity", as opposed to
 * "this message is bad".
 *
 * The distinction matters: retrying a rejected address on a second provider
 * just burns the second provider's quota and gets the same rejection. Only
 * capacity and availability problems are worth failing over.
 */
export function isCapacityError(error: string | null | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return /rate.?limit|too many|quota|429|daily limit|limit reached|exceeded|insufficient|502|503|504|timeout|network|unavailable/.test(e);
}

/** Send through Brevo. One request per message, which is Brevo's API shape. */
export async function sendViaBrevo(
  emails: MailMessage[], opts?: { bulk?: boolean }
): Promise<SendResult[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return emails.map(() => ({ id: null, error: "BREVO_API_KEY not set" }));

  const results: SendResult[] = [];
  for (const e of emails) {
    const headers: Record<string, string> = {};
    if (opts?.bulk && e.unsubscribeUrl) {
      // Gmail and Yahoo require these on bulk mail. Missing them is one of
      // the strongest signals that pushes a message into spam.
      headers["List-Unsubscribe"] = `<${e.unsubscribeUrl}>, <mailto:unsubscribe@myjobhack.co>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: e.to }],
          replyTo: { email: REPLY_TO },
          subject: e.subject,
          htmlContent: e.html,
          textContent: e.text,
          ...(Object.keys(headers).length ? { headers } : {})
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        results.push({ id: null, error: json?.message ?? `Brevo HTTP ${res.status}` });
      } else {
        results.push({ id: json?.messageId ?? null, error: null });
      }
    } catch (err: any) {
      results.push({ id: null, error: err?.message ?? "Brevo network error" });
    }
  }
  return results;
}

/** Confirm the key works and the account has headroom, for the doctor page. */
export async function brevoStatus(): Promise<{
  ok: boolean; detail: string; remaining?: number;
}> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, detail: "BREVO_API_KEY is not set, so there is no fallback sender." };
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": key, accept: "application/json" }
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, detail: json?.message ?? `Brevo returned HTTP ${res.status}` };
    const credits = json?.plan?.find?.((p: any) => p.type === "sendLimit" || p.credits != null);
    return {
      ok: true,
      detail: `Connected as ${json?.email ?? "unknown account"}.`,
      remaining: credits?.credits ?? undefined
    };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "Could not reach Brevo." };
  }
}
