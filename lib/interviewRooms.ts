import { createHmac, timingSafeEqual } from "crypto";
import { MEET_URL, OWN_ROOM_PATH, type RoomKind } from "@/lib/interviewRoomKind";

/**
 * Video rooms for interviews. Server only: this holds the Jitsi secret.
 *
 * Two kinds of room besides a pasted link:
 *
 *   meet   The interviewer's own standing Google Meet room. Candidates share
 *          it and wait to be admitted, so the interviewer controls who is in.
 *
 *   jitsi  Our own Jitsi server. Every interview gets a private room whose
 *          name cannot be guessed, and nobody gets in without a pass signed
 *          here: the candidate's is good only around their slot and only for
 *          their room. Switched off until the server exists (see
 *          ops/jitsi/README.md) and an admin turns it on.
 */

const KEY = "interview_rooms";
const APP = () => (process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co").replace(/\/$/, "");

export type RoomSettings = {
  /** What new video interviews use unless the scheduler picks otherwise. */
  default_kind: RoomKind;
  /** The admin switch. Only meaningful once the server settings exist. */
  jitsi_enabled: boolean;
  /** Each person's own Google Meet room, by profile id. */
  meet_links: Record<string, { url: string; name: string; saved_at: string }>;
};

export async function getRoomSettings(admin: any): Promise<RoomSettings> {
  const { data } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const v = (data?.value ?? {}) as any;
  return {
    default_kind: ["jitsi", "meet", "manual"].includes(v.default_kind) ? v.default_kind : "manual",
    jitsi_enabled: v.jitsi_enabled === true,
    meet_links: v.meet_links && typeof v.meet_links === "object" ? v.meet_links : {}
  };
}

export async function saveRoomSettings(admin: any, patch: Partial<RoomSettings>): Promise<RoomSettings> {
  const current = await getRoomSettings(admin);
  const next = { ...current, ...patch };
  const { error } = await admin.from("app_settings").upsert({ key: KEY, value: next }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return next;
}

// ---------------------------------------------------------------- Jitsi --

/**
 * The three settings that point at the server, kept in Vercel rather than the
 * database so the signing secret never sits in a table.
 *
 *   JITSI_DOMAIN       meet.myjobhack.co
 *   JITSI_APP_ID       the JWT_APP_ID the server was set up with
 *   JITSI_APP_SECRET   the JWT_APP_SECRET the server was set up with
 *   JITSI_JWT_SUB      optional; the server's XMPP domain, meet.jitsi by default
 */
export function jitsiConfig() {
  const domain = String(process.env.JITSI_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const appId = String(process.env.JITSI_APP_ID ?? "").trim();
  const secret = String(process.env.JITSI_APP_SECRET ?? "");
  const sub = String(process.env.JITSI_JWT_SUB ?? "meet.jitsi").trim();
  const missing = [
    !domain && "JITSI_DOMAIN", !appId && "JITSI_APP_ID",
    secret.length < 32 && "JITSI_APP_SECRET (at least 32 characters)"
  ].filter(Boolean) as string[];
  return { domain, appId, secret, sub, configured: missing.length === 0, missing };
}

/** On only when the server settings exist AND an admin has switched it on. */
export function jitsiActive(settings: RoomSettings): boolean {
  return jitsiConfig().configured && settings.jitsi_enabled;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64")
  .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function hmac(purpose: string, id: string): Buffer {
  return createHmac("sha256", jitsiConfig().secret).update(`${purpose}:${id}`).digest();
}

/**
 * The candidate's link carries the interview id and a signature over it, so
 * nobody can arrive at someone else's interview by changing a character.
 */
export function candidateRoomUrl(interviewId: string): string {
  return `${APP()}/interview/${interviewId}.${b64url(hmac("link", interviewId)).slice(0, 22)}`;
}

/** Check a link's signature. Returns the interview id, or null. */
export function verifyRoomRef(ref: string): string | null {
  const m = `/interview/${ref}`.match(OWN_ROOM_PATH);
  if (!m || !jitsiConfig().configured) return null;
  const [, id, sig] = m;
  const want = Buffer.from(b64url(hmac("link", id)).slice(0, 22));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/** The room's name on the server. Derived, never stored, never guessable. */
export function jitsiRoomName(interviewId: string): string {
  return `mjh${hmac("room", interviewId).toString("hex").slice(0, 24)}`;
}

/**
 * When the room is open to the candidate: 15 minutes before the slot until an
 * hour after it should have finished. Staff get an extra 45 minutes at the
 * start to set up. No time set (still being booked) means not open yet.
 */
export function roomWindow(iv: { scheduled_at?: string | null; duration_min?: number | null }, staff = false) {
  if (!iv.scheduled_at) return null;
  const start = Date.parse(iv.scheduled_at);
  if (!Number.isFinite(start)) return null;
  const opens = start - (staff ? 60 : 15) * 60_000;
  const closes = start + ((iv.duration_min || 30) + 60) * 60_000;
  return { opens, closes, start };
}

/**
 * A signed pass for one person into one room, in the format Jitsi's token
 * authentication expects. HS256 with the shared secret, built with Node's own
 * crypto so no library is needed for a dozen lines of work.
 */
export function jitsiToken(opts: {
  room: string; name: string; email?: string | null; moderator: boolean; expiresAt: number;
}): string {
  const cfg = jitsiConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "jitsi", iss: cfg.appId, sub: cfg.sub, room: opts.room,
    nbf: now - 60, iat: now,
    exp: Math.max(now + 300, Math.floor(opts.expiresAt / 1000)),
    context: {
      user: {
        name: opts.name.slice(0, 80),
        ...(opts.email ? { email: opts.email } : {}),
        // Read by servers set up to take moderation from the token; ignored
        // by those that are not. Rooms stay private either way, because
        // nobody without a pass can enter at all.
        moderator: opts.moderator
      }
    },
    moderator: opts.moderator
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", cfg.secret).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function jitsiJoinUrl(room: string, token: string, displayName: string): string {
  const { domain } = jitsiConfig();
  const name = encodeURIComponent(JSON.stringify(displayName));
  return `https://${domain}/${room}?jwt=${token}#userInfo.displayName=${name}`;
}

// ------------------------------------------------------- choosing a room --

export type RoomChoice =
  | { kind: "jitsi" }
  | { kind: "meet"; interviewer_id?: string }
  | { kind: "manual"; link?: string };

/** Read the scheduler's choice from a request body, defaulting sensibly. */
export function readRoomChoice(body: any, fallbackLink: string): RoomChoice {
  const r = body?.room;
  if (r?.kind === "jitsi") return { kind: "jitsi" };
  if (r?.kind === "meet") return { kind: "meet", interviewer_id: r.interviewer_id ? String(r.interviewer_id) : undefined };
  return { kind: "manual", link: fallbackLink };
}

/**
 * Turn the choice into the link that goes on each interview and in each
 * email. Returns a function of the interview id, because a Jitsi link is per
 * interview while a Meet link is the same for everyone.
 *
 * Refuses rather than falling back, so a scheduler who picked a room never
 * sends invitations with a different one, or none.
 */
export async function resolveRoom(admin: any, choice: RoomChoice, userId: string, mode: string): Promise<
  { ok: true; kind: RoomKind; linkFor: (interviewId: string) => string; interviewerName?: string }
  | { ok: false; error: string }
> {
  if (mode !== "video" || choice.kind === "manual") {
    const link = choice.kind === "manual" ? String(choice.link ?? "") : "";
    return { ok: true, kind: "manual", linkFor: () => link };
  }

  const settings = await getRoomSettings(admin);

  if (choice.kind === "jitsi") {
    if (!jitsiActive(settings))
      return { ok: false, error: "Our own interview room is not switched on yet. Choose Google Meet or paste a link." };
    return { ok: true, kind: "jitsi", linkFor: candidateRoomUrl };
  }

  const who = choice.interviewer_id || userId;
  const saved = settings.meet_links[who];
  if (!saved || !MEET_URL.test(saved.url))
    return {
      ok: false,
      error: who === userId
        ? "You have not saved your Google Meet link yet. Save it in the Video room box, then send again."
        : "That interviewer has not saved a Google Meet link."
    };
  return { ok: true, kind: "meet", linkFor: () => saved.url, interviewerName: saved.name };
}

/**
 * Whose saved Meet links a person may pick from. Staff see staff; anyone else,
 * such as an employer, sees only their own, so one company's interviewers'
 * rooms are never listed to another.
 */
export async function visibleMeetLinks(admin: any, userId: string, isStaff: boolean, settings: RoomSettings) {
  const entries = Object.entries(settings.meet_links);
  if (!isStaff) return entries.filter(([id]) => id === userId).map(([id, v]) => ({ id, ...v }));
  const ids = entries.map(([id]) => id);
  if (!ids.length) return [];
  const { data: staff } = await admin.from("profiles").select("id").in("id", ids).in("role", ["admin", "recruiter"]);
  const ok = new Set((staff ?? []).map((p: any) => p.id));
  return entries.filter(([id]) => ok.has(id) || id === userId).map(([id, v]) => ({ id, ...v }));
}
