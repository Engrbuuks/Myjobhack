/**
 * MYJOBHACK email design system.
 * Email-safe rendition of the brand DNA: ink card on paper, coral accents,
 * Georgia serif display (Fraunces' email-safe cousin), table-based layout
 * so it renders correctly in Gmail, Outlook, Apple Mail, and Nigerian
 * webmail clients alike.
 */

export type EmailSpec = {
  preheader?: string;               // inbox preview line
  kicker: string;                   // e.g. "Training invitation"
  heading: string;                  // big serif line
  paragraphs?: string[];            // body copy (plain text, we escape)
  details?: [string, string][];     // label/value rows
  bullets?: string[];               // coral-dot value bullets (marketing)
  cta?: { label: string; url: string };
  footNote?: string;                // small line under the CTA
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderEmail(spec: EmailSpec): string {
  const paragraphs = (spec.paragraphs ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 18px;color:rgba(255,255,255,.72);font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75">${esc(p)}</p>`
    )
    .join("");

  const bullets = spec.bullets?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 22px">
        ${spec.bullets
          .map(
            (b) =>
              `<tr>
                <td style="padding:6px 12px 6px 0;vertical-align:top"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#FC5647;margin-top:5px"></span></td>
                <td style="padding:6px 0;color:rgba(255,255,255,.78);font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">${esc(b)}</td>
              </tr>`
          )
          .join("")}
      </table>`
    : "";

  const details = spec.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 26px">
        ${spec.details
          .map(
            ([k, v]) =>
              `<tr>
                <td style="padding:5px 18px 5px 0;color:rgba(255,255,255,.45);font-family:Arial,Helvetica,sans-serif;font-size:13px;white-space:nowrap">${esc(k)}</td>
                <td style="padding:5px 0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold">${esc(v)}</td>
              </tr>`
          )
          .join("")}
      </table>`
    : "";

  const cta = spec.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0">
        <tr><td style="border-radius:999px;background:#FC5647">
          <a href="${spec.cta.url}"
            style="display:inline-block;padding:15px 32px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;border-radius:999px">
            ${esc(spec.cta.label)} &rarr;
          </a>
        </td></tr>
      </table>`
    : "";

  const footNote = spec.footNote
    ? `<p style="margin:22px 0 0;color:rgba(255,255,255,.4);font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6">${esc(spec.footNote)}</p>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(spec.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#F7FAFA">
${spec.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(spec.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAFA">
<tr><td align="center" style="padding:36px 16px">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

    <!-- ink card -->
    <tr><td style="background:#083E40;border-radius:24px;padding:40px 36px">

      <!-- wordmark -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff">
            myjob<span style="color:#FC5647">hack</span>
          </td>
          <td align="right">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FC5647"></span>
          </td>
        </tr>
      </table>

      <!-- kicker -->
      <p style="margin:30px 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#FFB4AC">
        ${esc(spec.kicker)}
      </p>

      <!-- heading (serif display) -->
      <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:28px;line-height:1.25;color:#ffffff;letter-spacing:-.01em">
        ${esc(spec.heading)}
      </h1>

      ${paragraphs}
      ${bullets}
      ${details}
      ${cta}
      ${footNote}

      <!-- hairline + coral bar signature -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:34px">
        <tr><td style="border-top:1px solid rgba(255,255,255,.1);padding-top:18px">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="width:44px;height:5px;border-radius:3px;background:#FC5647"></td></tr>
          </table>
        </td></tr>
      </table>

    </td></tr>

    <!-- footer -->
    <tr><td align="center" style="padding:20px 10px 0">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#9FA2AE">
        MYJOBHACK — Workforce transformation for Africa<br>
        <a href="https://myjobhack.co" style="color:#9FA2AE;text-decoration:underline">myjobhack.co</a>
        &nbsp;·&nbsp;
        <a href="https://app.myjobhack.co" style="color:#9FA2AE;text-decoration:underline">app.myjobhack.co</a>
      </p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/**
 * PLAIN email — for campaigns and any bulk send.
 *
 * The branded template above is deliberately designed: dark card, large serif
 * heading, pill CTA button. That design is exactly what Gmail's classifier reads
 * as "marketing", which lands it in Promotions. For bulk mail we send something
 * that looks like a person wrote it: left-aligned text, a normal text link
 * instead of a button, minimal styling, no dark card.
 *
 * Use renderEmail() for transactional mail (receipts, invites, notifications)
 * and renderPlainEmail() for campaigns.
 */
/**
 * BRANDED-LIGHT email — for campaigns and any bulk send.
 *
 * The full branded template (dark card, pill button, large serif) is what
 * Gmail's classifier reads as marketing. This keeps the MYJOBHACK identity —
 * teal headings, coral accent, the wordmark — but on a white background with
 * a text-weight link instead of a button, which reads far closer to ordinary
 * correspondence.
 *
 * Use renderEmail() for transactional mail (receipts, invoices, invites) and
 * renderPlainEmail() for campaigns.
 */
export function renderPlainEmail(opts: {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
  cta?: { label: string; url: string };
  signoff?: string;
  unsubscribeUrl?: string;
}): string {
  const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const font = "font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
  const TEAL = "#083E40", TEAL2 = "#0C5A5D", CORAL = "#FC5647", LINE = "#DCEAE9", MUTED = "#4C6667";

  const paras = opts.paragraphs.map(p =>
    `<p style="margin:0 0 16px;${font};font-size:15px;line-height:1.65;color:#1a1a1a">${esc(p)}</p>`
  ).join("");

  // Bullets carry a small coral marker — brand presence without looking like an advert.
  const bullets = opts.bullets?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${
        opts.bullets.map(b =>
          `<tr>
             <td style="padding:0 10px 8px 0;vertical-align:top">
               <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${CORAL};margin-top:7px"></span>
             </td>
             <td style="padding:0 0 8px;${font};font-size:15px;line-height:1.6;color:#1a1a1a">${esc(b)}</td>
           </tr>`).join("")
      }</table>`
    : "";

  // A bold teal link with a coral arrow — reads as a link, not a banner ad.
  const cta = opts.cta
    ? `<p style="margin:0 0 18px;${font};font-size:15px;line-height:1.6">
         <a href="${opts.cta.url}" style="color:${TEAL2};font-weight:600;text-decoration:underline">${esc(opts.cta.label)}</a>
         <span style="color:${CORAL};font-weight:700">&nbsp;&rarr;</span>
       </p>`
    : "";

  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:20px 0 0;${font};font-size:12px;line-height:1.5;color:#8a9a99">
         If you'd rather not receive these, <a href="${opts.unsubscribeUrl}" style="color:#8a9a99">unsubscribe here</a>.
       </p>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
  <tr><td align="left" style="padding:26px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

      <!-- Wordmark: text only, no logo image. Images are a Promotions signal. -->
      <tr><td style="padding-bottom:6px">
        <span style="${font};font-size:17px;font-weight:700;color:${TEAL};letter-spacing:-.2px">myjob<span style="color:${CORAL}">hack</span></span>
      </td></tr>

      <!-- Thin coral rule: brand presence at almost no deliverability cost -->
      <tr><td style="padding-bottom:20px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:34px;height:2px;background:${CORAL};font-size:0;line-height:0">&nbsp;</td>
        </tr></table>
      </td></tr>

      <tr><td>
        ${opts.heading ? `<p style="margin:0 0 16px;${font};font-size:17px;font-weight:600;line-height:1.45;color:${TEAL}">${esc(opts.heading)}</p>` : ""}
        ${paras}
        ${bullets}
        ${cta}
        <p style="margin:22px 0 0;${font};font-size:15px;line-height:1.6;color:#1a1a1a">${esc(opts.signoff ?? "\u2014 The MYJOBHACK team")}</p>
      </td></tr>

      <tr><td style="padding-top:22px;border-top:1px solid ${LINE}">
        <p style="margin:14px 0 0;${font};font-size:12px;line-height:1.5;color:${MUTED}">
          MYJOBHACK &middot; Verified by competency. Not just a CV.
        </p>
        ${unsub}
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
