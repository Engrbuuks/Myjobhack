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
export type WaTarget = "web" | "mobile" | "api";

/**
 * Which WhatsApp entry point actually carries the pre-filled message.
 *
 * This differs by device, and getting it wrong is why a chat opens with an
 * empty box:
 *
 *  · web.whatsapp.com/send   reliably keeps the text, but only in a browser.
 *  · wa.me                   is right on a phone, where it opens the app with
 *                            the message intact.
 *  · api.whatsapp.com/send   hands off to the DESKTOP APP where one is
 *                            installed, and that handoff frequently drops the
 *                            text, opening the chat with nothing typed.
 *
 * So the default follows the device rather than being one link for everyone.
 */
export function detectTarget(): WaTarget {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return isMobile ? "mobile" : "web";
}

export function waLink(e164: string, message: string, target: WaTarget = "web"): string | null {
  const num = waNumber(e164);
  if (!num) return null;
  /**
   * Kept short on purpose. The message rides in the URL, and a long encoded
   * body pushes the address past what some browsers and the WhatsApp handler
   * will accept, which shows as a blank page rather than an error.
   */
  const text = encodeURIComponent((message || "").slice(0, 700));
  switch (target) {
    case "mobile": return `https://wa.me/${num}?text=${text}`;
    case "api":    return `https://api.whatsapp.com/send?phone=${num}&text=${text}`;
    default:       return `https://web.whatsapp.com/send?phone=${num}&text=${text}`;
  }
}

export const TARGET_LABELS: Record<WaTarget, string> = {
  web: "WhatsApp Web, keeps the message",
  mobile: "Phone, opens the app",
  api: "Desktop app, may drop the message"
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
