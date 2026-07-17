type SendResult = { id: string | null; error: string | null };

const FROM = process.env.RESEND_FROM || "MYJOBHACK <no-reply@myjobhack.co>";

export async function sendBatch(
  emails: { to: string; subject: string; html: string }[]
): Promise<SendResult[]> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return emails.map(() => ({ id: null, error: "RESEND_API_KEY not set" }));

  const results: SendResult[] = [];
  // Resend batch endpoint accepts up to 100 per call
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100).map((e) => ({
      from: FROM, to: [e.to], subject: e.subject, html: e.html
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

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const [res] = await sendBatch([{ to, subject, html }]);
  return res;
}

import { renderEmail } from "@/lib/email";

export function inviteEmailHtml(opts: {
  name: string; trainingTitle: string; description: string;
  when: string; where: string; appUrl: string;
}) {
  return renderEmail({
    preheader: `You've been selected for ${opts.trainingTitle}`,
    kicker: "Training invitation",
    heading: opts.trainingTitle,
    paragraphs: [
      `Hi ${opts.name || "there"} — based on your skills and career goals, you've been selected for this training.`,
      ...(opts.description ? [opts.description] : [])
    ],
    details: [
      ["When", opts.when],
      ["Where", opts.where]
    ],
    cta: { label: "View & register", url: `${opts.appUrl}/portal/seeker/trainings` },
    footNote: "You're receiving this because your MYJOBHACK profile matches this training's audience."
  });
}
