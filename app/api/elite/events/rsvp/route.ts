import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * RSVP to a chapter event.
 *
 * POST { event_id, response: "going" | "not_going" }
 *
 * The checks here are the ones a policy cannot express cleanly: that the
 * caller is a verified member OF THAT CHAPTER, that the event is not
 * cancelled, that it has not already happened, and that the seats are not
 * gone. Migration 0064 also enforces the chapter rule in the policy, so a
 * direct PostgREST write is refused as well.
 *
 * Changing your mind is an update of the same row rather than a new one, so
 * the count of a released seat is always right.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({} as any));
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const response = body.response === "not_going" ? "not_going" : "going";
  if (!eventId) return NextResponse.json({ error: "event_id is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: me } = await admin.from("elite_memberships")
    .select("status, chapter_id").eq("talent_id", user.id).maybeSingle();
  if (me?.status !== "verified")
    return NextResponse.json({
      error: "Chapter events open once your membership is verified."
    }, { status: 403 });

  const { data: event } = await admin.from("chapter_events")
    .select("id, chapter_id, starts_at, capacity, cancelled_at, title").eq("id", eventId).maybeSingle();

  // One answer for "not yours" and "does not exist", so this cannot be used
  // to find out what other chapters have planned.
  if (!event || event.chapter_id !== me.chapter_id)
    return NextResponse.json({ error: "That event is not in your chapter." }, { status: 404 });

  if (event.cancelled_at)
    return NextResponse.json({ error: "That meetup was cancelled." }, { status: 409 });

  if (new Date(event.starts_at).getTime() < Date.now())
    return NextResponse.json({ error: "That meetup has already happened." }, { status: 409 });

  /**
   * Capacity, checked before the write rather than after.
   *
   * There is a narrow race here if two people answer in the same instant and
   * the last seat is at stake. The consequence is one extra attendee at a
   * breakfast, so it is not worth a lock; a hard limit would belong in a
   * constraint, and this is not that kind of seat.
   */
  if (response === "going" && event.capacity != null) {
    const { count } = await admin.from("chapter_event_rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId).eq("response", "going");
    const { data: mine } = await admin.from("chapter_event_rsvps")
      .select("response").eq("event_id", eventId).eq("profile_id", user.id).maybeSingle();
    const alreadyCounted = mine?.response === "going";
    if (!alreadyCounted && (count ?? 0) >= event.capacity)
      return NextResponse.json({
        error: `This meetup is full at ${event.capacity}. Nothing was recorded, so if a seat frees up you can answer again.`
      }, { status: 409 });
  }

  const { error } = await admin.from("chapter_event_rsvps")
    .upsert({ event_id: eventId, profile_id: user.id, response }, { onConflict: "event_id,profile_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: going } = await admin.from("chapter_event_rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId).eq("response", "going");

  return NextResponse.json({
    ok: true,
    response,
    going: going ?? 0,
    message: response === "going"
      ? `You are on the list for ${event.title}.`
      : "Your seat is released."
  });
}
