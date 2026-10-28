/**
 * Which kind of video room an interview link is, and what the candidate needs
 * to be told about it. No secrets and no database here, because the scheduler
 * screens import it too.
 */

export type RoomKind = "jitsi" | "meet" | "manual";

/** A Google Meet address, exactly. Anything else is refused when saved. */
export const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/** The candidate's link into one of our own rooms: /interview/<id>.<signature> */
export const OWN_ROOM_PATH = /\/interview\/([0-9a-f-]{36})\.([A-Za-z0-9_-]{16,})$/;

export function roomKindOf(link: string | null | undefined): RoomKind {
  const v = String(link ?? "").trim();
  if (OWN_ROOM_PATH.test(v)) return "jitsi";
  if (/^https:\/\/meet\.google\.com\//.test(v)) return "meet";
  return "manual";
}

/** Tidy what someone pasted: drop tracking parameters, keep the room code. */
export function normaliseMeetUrl(raw: string): string | null {
  const m = String(raw ?? "").trim().match(/^(?:https?:\/\/)?meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[/?#].*)?$/i);
  return m ? `https://meet.google.com/${m[1].toLowerCase()}` : null;
}

/**
 * What the invitation says about getting in, added after the recruiter's own
 * words so it is always present whatever the template says.
 *
 * Google Meet: everyone shares the interviewer's room and waits to be let in,
 * so the candidate must type the name they applied with, or the interviewer
 * cannot tell who is knocking.
 *
 * Our own room: private to this candidate and only open around their time,
 * so the thing to explain is when the link starts working.
 */
export function roomGuidance(kind: RoomKind): string | null {
  if (kind === "meet")
    return "At your interview time, open the Google Meet link, type the full name you applied with, and click Ask to join. You will be let in when it is your turn, so please wait if it takes a few minutes. You do not need a Google account.";
  if (kind === "jitsi")
    return "Your interview link opens 15 minutes before your interview time. You do not need an account or an app. A laptop with Chrome works best; on a phone, allow the browser to use your camera and microphone when asked.";
  return null;
}
