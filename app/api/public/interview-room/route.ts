import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRoomRef, roomWindow, jitsiRoomName, jitsiToken, jitsiJoinUrl } from "@/lib/interviewRooms";
import { rateLimit, clientIp, LIMITS, tooMany } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A candidate entering their interview room.
 *
 * GET ?ref=<id>.<signature>   from the Join button on /interview/<ref>
 *
 * Everything the page checked is checked again here, because this is the
 * request that hands out a pass: the signature, that the interview exists and
 * is not cancelled, and that it is inside the window. The pass is for this
 * room only, carries the candidate's own name, and stops working when the
 * window closes. It is never a moderator pass.
 *
 * Each entry is logged, so the desk can see the candidate turned up even if
 * the interviewer was late.
 */
export async function GET(request: Request) {
  const limit = await rateLimit(clientIp(request), LIMITS.room_join_ip);
  if (!limit.ok) return tooMany("Too many attempts from this connection. Wait a few minutes and try again.", limit.retryAfterSeconds);

  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  const back = new URL(`/interview/${encodeURIComponent(ref)}`, url.origin);

  const id = verifyRoomRef(ref);
  if (!id) return NextResponse.redirect(back, 303);

  const admin = createAdminClient();
  const { data: iv } = await admin.from("interviews")
    .select("id, status, scheduled_at, duration_min, guest_name, guest_email, talent_id")
    .eq("id", id).maybeSingle();
  const w = iv ? roomWindow(iv) : null;
  const now = Date.now();
  // Outside the window, cancelled or gone: back to the page, which explains.
  if (!iv || iv.status === "cancelled" || !w || now < w.opens || now > w.closes)
    return NextResponse.redirect(back, 303);

  const { data: prof } = iv.talent_id
    ? await admin.from("profiles").select("full_name, email").eq("id", iv.talent_id).maybeSingle()
    : { data: null as any };
  const name = String(prof?.full_name ?? iv.guest_name ?? "Candidate");

  const room = jitsiRoomName(iv.id);
  const token = jitsiToken({
    room, name, email: prof?.email ?? iv.guest_email ?? null, moderator: false, expiresAt: w.closes
  });

  await admin.from("activity_log").insert({
    actor_id: null, action: "Interview room joined", entity: "interview", entity_id: iv.id,
    meta: { who: "candidate", at: new Date(now).toISOString() }
  }).then(() => null, () => null);

  const res = NextResponse.redirect(jitsiJoinUrl(room, token, name), 302);
  // The pass is in the address. Keep it out of caches and referrer headers.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
