type SendResult = { id: string | null; error: string | null };

const FROM = process.env.RESEND_FROM || "MYJOBHACK <no-reply@myjobhack.co>";
const REPLY_TO = process.env.RESEND_REPLY_TO || "hello@myjobhack.co";
const APP = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Strips HTML to a readable plain-text alternative.
 * Sending HTML-only is one of the strongest "this is marketing" signals there is —
 * genuine correspondence almost always carries both parts.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = String(label).replace(/<[^>]+>/g, "").trim();
      return text && !href.includes(text) ? `${text} (${href})` : href;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8203;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trim()).join("\n")
    .trim();
}

type SendOpts = {
  /** Bulk/marketing mail must carry unsubscribe headers. Transactional must not. */
  bulk?: boolean;
  /** Per-recipient unsubscribe link, if you have one. */
  unsubscribeUrl?: string;
  /**
   * How many to send per chunk, and how long to pause between chunks.
   *
   * Honest note: pacing helps with provider rate limits and spam filtering,
   * and it lets you abort a bad send mid-flight. It does NOT reliably move
   * mail from Promotions to Primary — that is decided by content shape and
   * engagement history, not send timing.
   */
  chunkSize?: number;
  pauseMs?: number;
};

function headersFor(opts?: SendOpts) {
  if (!opts?.bulk) return undefined;
  const url = opts.unsubscribeUrl || `${APP}/portal/account`;
  return {
    // Gmail and Yahoo require these for bulk senders. Missing them is one of
    // the strongest signals that pushes mail into Promotions or Spam.
    "List-Unsubscribe": `<${url}>, <mailto:unsubscribe@myjobhack.co>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}

export async function sendBatch(
  emails: { to: string; subject: string; html: string; text?: string; unsubscribeUrl?: string }[],
  opts?: SendOpts
): Promise<SendResult[]> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return emails.map(() => ({ id: null, error: "RESEND_API_KEY not set" }));

  const results: SendResult[] = [];
  const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? 100, 100));
  const pauseMs = Math.max(0, opts?.pauseMs ?? 0);

  for (let i = 0; i < emails.length; i += chunkSize) {
    // Pace between chunks so a large campaign trickles rather than bursts.
    if (i > 0 && pauseMs) await new Promise(r => setTimeout(r, pauseMs));
    const chunk = emails.slice(i, i + chunkSize).map((e) => ({
      from: FROM,
      to: [e.to],
      subject: e.subject,
      html: e.html,
      // Always send a plain-text part alongside the HTML.
      text: e.text ?? htmlToText(e.html),
      reply_to: REPLY_TO,
      ...(headersFor({ ...opts, unsubscribeUrl: e.unsubscribeUrl ?? opts?.unsubscribeUrl })
        ? { headers: headersFor({ ...opts, unsubscribeUrl: e.unsubscribeUrl ?? opts?.unsubscribeUrl }) }
        : {})
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk)
      });
      const json = await res.json();
      if (!res.ok) {
        results.push(...chunk.map(() => ({ id: null, error: json?.message ?? `HTTP ${res.status}` })));
      } else {
        const data: { id: string }[] = json?.data ?? [];
        chunk.forEach((_, idx) => results.push({ id: data[idx]?.id ?? null, error: null }));
      }
    } catch (e: any) {
      results.push(...chunk.map(() => ({ id: null, error: e?.message ?? "network error" })));
    }
  }
  return results;
}

export async function sendEmail(
  to: string, subject: string, html: string, opts?: SendOpts
): Promise<SendResult> {
  const [res] = await sendBatch([{ to, subject, html }], opts);
  return res;
}

/**
 * Training invitation email. Kept here for backwards compatibility with the
 * invite engine; renders through the shared branded template.
 */
export function inviteEmailHtml(opts: {
  name: string; trainingTitle: string; description: string;
  when: string; where: string; appUrl: string;
}): string {
  const { renderEmail } = require("@/lib/email");
  return renderEmail({
    kicker: "Training invitation",
    heading: `${opts.name}, you're invited to ${opts.trainingTitle}`,
    paragraphs: [
      opts.description || "A place has been reserved for you on this training.",
      "Accept your invite in your portal to confirm your seat."
    ],
    details: [["When", opts.when], ["Where", opts.where]],
    cta: { label: "Accept my invite", url: `${opts.appUrl}/portal/seeker/trainings` }
  });
}
