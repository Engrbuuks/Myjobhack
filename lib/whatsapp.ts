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

/** wa.me wants digits only: no plus, no spaces, no leading zero. */
export function waNumber(e164: string): string | null {
  const digits = (e164 || "").replace(/\D/g, "");
  // A country code plus a national number is at least 10 digits in practice.
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
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
export function detectTarget(): WaTarget {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "mobile";
  /**
   * Web, not the desktop app.
   *
   * WhatsApp Desktop accepts the phone number from a whatsapp:// link and
   * IGNORES the text, so the chat opens with an empty box. WhatsApp Web fills
   * it every time. Since the whole point is a pre-written message, web is the
   * correct default on a computer even though the app feels faster.
   */
  return "web";
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
  mobile: "Phone, opens the app"
};

export const TARGET_HELP: Record<WaTarget, string> = {
  app: "Opens the installed desktop app. It accepts the number but ignores the message, so the chat opens with an empty box. Only useful if you intend to type each one.",
  web: "Fills the message reliably. Uses one tab that is reused for every candidate, so it loads once rather than once per person. You must be signed in to WhatsApp Web first.",
  mobile: "Hands off to WhatsApp on your phone. Use this when you are working from a handset."
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
