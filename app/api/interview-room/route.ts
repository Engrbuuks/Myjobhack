import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roomWindow, jitsiRoomName, jitsiToken, jitsiJoinUrl, jitsiConfig, candidateRoomUrl } from "@/lib/interviewRooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The interviewer entering an interview room.
 *
 * GET ?id=<interview id>   from "Join as interviewer" on the interview desk
 *
 * The candidate's link must never be used for this: it would put the
 * interviewer in under the candidate's name. So staff come through here,
 * signed in, and get a pass in their own name, marked as moderator.
 *
 * Who may: staff, or a member of the employer organisation that owns the
 * interview, the same rule as every other interview action. The room opens
 * to them an hour early so they can test their camera first.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Which interview?" }, { status: 400 });
  if (!jitsiConfig().configured)
    return NextResponse.json({ error: "Our interview room server is not set up." }, { status: 400 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, full_name, email").eq("id", user.id).maybeSingle();
  const { data: iv } = await admin.from("interviews")
    .select("id, org_id, status, scheduled_at, duration_min, location_or_link").eq("id", id).maybeSingle();
  if (!iv) return NextResponse.json({ error: "That interview no longer exists." }, { status: 404 });

  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");
  let allowed = isStaff;
  if (!allowed && iv.org_id) {
    const { data: m } = await admin.from("org_members")
      .select("org_id").eq("org_id", iv.org_id).eq("profile_id", user.id).maybeSingle();
    allowed = !!m;
  }
  if (!allowed) return NextResponse.json({ error: "Not authorized for this interview." }, { status: 403 });

  // Only interviews that were given one of our rooms have one to join.
  if (iv.location_or_link !== candidateRoomUrl(iv.id))
    return NextResponse.json({ error: "This interview does not use our own room. Use its own link." }, { status: 400 });
  if (iv.status === "cancelled")
    return NextResponse.json({ error: "This interview was cancelled." }, { status: 410 });

  const w = roomWindow(iv, true);
  const now = Date.now();
  if (!w) return NextResponse.json({ error: "This interview has no time set yet, so its room is not open." }, { status: 400 });
  if (now < w.opens) {
    const at = new Date(w.opens).toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
    return NextResponse.json({ error: `The room opens for interviewers at ${at}, an hour before the interview.` }, { status: 400 });
  }
  if (now > w.closes) return NextResponse.json({ error: "This interview's room has closed." }, { status: 410 });

  const name = String(me?.full_name || "Interviewer");
  const room = jitsiRoomName(iv.id);
  const token = jitsiToken({ room, name, email: me?.email ?? null, moderator: true, expiresAt: w.closes });

  await admin.from("activity_log").insert({
    actor_id: user.id, action: "Interview room joined", entity: "interview", entity_id: iv.id,
    meta: { who: "interviewer" }
  }).then(() => null, () => null);

  const res = NextResponse.redirect(jitsiJoinUrl(room, token, name), 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
