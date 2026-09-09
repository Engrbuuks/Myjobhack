import { toE164 } from "@/lib/phone";

/**
 * WhatsApp messages to candidates, without the Business API.
 *
 * WHY CLICK TO CHAT RATHER THAN THE API: sending programmatically requires the
 * WhatsApp Business Platform, a verified Meta business account, and message
 * templates approved by Meta in advance. Anyone who has not messaged you in
 * the last 24 hours can only receive an approved template, and approval takes
 * a day or two. That is the right long term route, and it cannot be stood up
 * for a message going out tomorrow.
 *
 * A wa.me link opens WhatsApp with the message already written. You press
 * send. It needs no approval, no verification and no per message cost, and it
 * works from a phone or WhatsApp Web. The cost is that it is one tap per
 * person rather than one click for everyone.
 */

/**
 * wa.me wants digits only, in full international form.
 *
 * THE TRAP: a locally written Nigerian number is eleven digits, 09029815294.
 * Stripping non-digits leaves eleven digits, which passes a naive length
 * check, and produces wa.me/09029815294. There is no country with dialling
 * code 0, so WhatsApp rejects it and the chat never opens. The leading zero
 * is a trunk prefix and has to be REPLACED by the country code.
 *
 * Numbers stored before the apply form validated them are all in that shape,
 * so repairing here means old applications work without waiting for the data
 * to be corrected.
 */
export function waNumber(raw: string): string | null {
  const e164 = toE164(raw);
  if (!e164) return null;
  return e164.replace(/\D/g, "");
}

/**
 * A click to chat link with the message pre-filled.
 *
 * Kept under roughly 1500 characters: the text rides in the URL, and very
 * long messages get truncated by some browsers before WhatsApp sees them.
 */
export type WaTarget = "app" | "web" | "mobile";

/**
 * How to open WhatsApp, and why the choice matters more than it looks.
 *
 * THE PROBLEM WITH web.whatsapp.com: it is a full single page app. Every
 * link opens a fresh tab that downloads the bundle, restores the session and
 * only then navigates to the chat. That boot is what shows as a dark blank
 * screen, and doing it once per candidate means thirty seven cold boots in
 * thirty seven tabs. It is the wrong shape for sending a list.
 *
 *   app     whatsapp://send   Hands straight to WhatsApp Desktop with no
 *                             browser load at all. Instant, keeps the text,
 *                             and the right default on a computer that has
 *                             the app installed.
 *   web     web.whatsapp.com  The browser client. Works without the desktop
 *                             app, but boots on every navigation, so it is
 *                             opened into ONE reused window rather than a new
 *                             tab each time.
 *   mobile  wa.me             Correct on a phone: hands to the installed app.
 */
/**
 * wa.me everywhere, unless the tester says otherwise.
 *
 * This was established by testing on the machine actually being used, rather
 * than reasoned about: wa.me opens the chat with the message filled in, on
 * desktop and on a phone. The alternatives were each tried and each failed in
 * their own way, so the default is the one with evidence behind it.
 *
 * The tester remains available for a machine that behaves differently, and a
 * saved choice there overrides this.
 */
export function detectTarget(): WaTarget {
  return "mobile";   // the wa.me shape, which works on both
}

/**
 * The link shape proven to work on this machine, chosen with the tester.
 *
 * Which variant survives depends on the browser, whether WhatsApp Desktop has
 * registered itself as the handler, and whether this browser has a WhatsApp
 * Web session. Those are not knowable from the server, so the answer is
 * measured once and remembered rather than assumed.
 */
export const WA_VARIANTS: Record<string, (num: string, text: string) => string> = {
  web_send:      (n, t) => `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`,
  wa_me:         (n, t) => `https://wa.me/${n}?text=${encodeURIComponent(t)}`,
  api_send:      (n, t) => `https://api.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`,
  protocol:      (n, t) => `whatsapp://send?phone=${n}&text=${encodeURIComponent(t)}`,
  web_send_plus: (n, t) => `https://web.whatsapp.com/send?phone=%2B${n}&text=${encodeURIComponent(t)}`,
  wa_me_slash:   (n) => `https://wa.me/${n}`
};

export function savedVariant(): string | null {
  try { return window.localStorage.getItem("mjh_wa_variant"); } catch { return null; }
}

/** Build a link using the saved variant when there is one. */
export function waLinkSaved(e164: string, message: string): string | null {
  const num = waNumber(e164);
  if (!num) return null;
  const text = (message || "").slice(0, 700);
  const id = savedVariant();
  const build = id ? WA_VARIANTS[id] : null;
  return build ? build(num, text) : waLink(e164, message, detectTarget());
}

/** Signing in once, so the first real send is not a QR screen. */
export const WA_WEB_HOME = "https://web.whatsapp.com";

export function waLink(e164: string, message: string, target: WaTarget = "app"): string | null {
  const num = waNumber(e164);
  if (!num) return null;
  /**
   * Kept short. The message travels inside the URL, and a long encoded body
   * pushes the address past what the protocol handler and some browsers
   * accept, which fails silently rather than reporting anything.
   */
  const text = encodeURIComponent((message || "").slice(0, 700));
  switch (target) {
    case "app":    return `whatsapp://send?phone=${num}&text=${text}`;
    case "mobile": return `https://wa.me/${num}?text=${text}`;
    default:       return `https://web.whatsapp.com/send?phone=${num}&text=${text}`;
  }
}

export const TARGET_LABELS: Record<WaTarget, string> = {
  app: "WhatsApp Desktop, does not fill the message",
  web: "WhatsApp Web, fills the message",
  mobile: "wa.me link, fills the message"
};

export const TARGET_HELP: Record<WaTarget, string> = {
  app: "Opens the installed desktop app. It accepts the number but ignores the message, so the chat opens with an empty box. Only useful if you intend to type each one.",
  web: "Fills the message reliably. Uses one tab that is reused for every candidate, so it loads once rather than once per person. You must be signed in to WhatsApp Web first.",
  mobile: "The wa.me short link. Opens the chat with the message already typed, on a computer or a phone. This is the default because it is the one proven to work."
};

/**
 * WhatsApp is plain text. Formatting is limited to *bold*, _italic_ and line
 * breaks, so anything written for email needs its HTML habits stripped.
 */
export function forWhatsApp(text: string): string {
  return (text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const RESUMPTION_TEMPLATE = `Hello {first_name}, this is {sender} from MYJOBHACK.

Congratulations. You are expected to resume for the {role} role.

{detail}

Please reply to confirm you have seen this. If anything is unclear, ask me here.`;

export const REMINDER_TEMPLATE = `Hello {first_name}, a reminder from MYJOBHACK about your {role} interview.

{detail}

Please reply to confirm you are still coming.`;

/**
 * Why a candidate cannot be messaged, said plainly.
 *
 * A silently skipped row is worse than a listed one: you would never know
 * somebody was missed until they failed to turn up.
 */
export function whyNotReachable(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return "No phone number on file";
  if (!waNumber(phone)) return "Phone number is not in a usable format";
  return null;
}
