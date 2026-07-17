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

export function inviteEmailHtml(opts: {
  name: string; trainingTitle: string; description: string;
  when: string; where: string; appUrl: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#FAFAF8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="background:#0C0D11;border-radius:20px;padding:36px 32px;color:#fff">
    <div style="font-size:20px;font-weight:700;margin-bottom:6px">myjob<span style="color:#FC5647">hack</span></div>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#FFB4AC;margin-bottom:26px">Training invitation</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.25;margin:0 0 14px">${opts.trainingTitle}</h1>
    <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0 0 20px">Hi ${opts.name || "there"} — based on your skills and career goals, you've been selected for this training.</p>
    <p style="color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;margin:0 0 20px">${opts.description}</p>
    <table style="font-size:14px;color:#fff;margin:0 0 26px">
      <tr><td style="padding:4px 14px 4px 0;color:rgba(255,255,255,.5)">When</td><td>${opts.when}</td></tr>
      <tr><td style="padding:4px 14px 4px 0;color:rgba(255,255,255,.5)">Where</td><td>${opts.where}</td></tr>
    </table>
    <a href="${opts.appUrl}" style="display:inline-block;background:#FC5647;color:#fff;font-weight:700;font-size:14px;padding:14px 28px;border-radius:999px;text-decoration:none">View & register &rarr;</a>
  </div>
  <p style="text-align:center;color:#9FA2AE;font-size:11px;margin-top:18px">MYJOBHACK — Workforce transformation for Africa</p>
</div></body></html>`;
}
