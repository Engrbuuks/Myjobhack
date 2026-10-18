import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";

export const runtime = "nodejs";

/**
 * Staff create and cancel chapter meetups. Members only RSVP.
 *
 * POST  { chapter_id, title, details, starts_at, ends_at, venue, joining_link, capacity, guests }
 * PATCH { id, cancelled } or { id, ...fields }
 *
 * Gated on the chapters.manage capability rather than on the admin role,
 * because the role check that used to stand in for authorisation is exactly
 * what the capability system was built to replace. Hiding the form would not
 * be enforcement: this request can be made by hand.
 */
export async function POST(request: Request) {
  const perm = await requirePermission("chapters.manage");
  if (!perm.ok) return perm.response;

  const b = await request.json().catch(() => ({} as any));
  const chapterId = typeof b.chapter_id === "string" ? b.chapter_id : "";
  const title = String(b.title ?? "").trim();
  const startsAt = String(b.starts_at ?? "").trim();

  if (!chapterId || !title || !startsAt)
    return NextResponse.json({ error: "Chapter, title and a start time are required." }, { status: 400 });

  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime()))
    return NextResponse.json({ error: "That start time is not a date." }, { status: 400 });

  const admin = createAdminClient();
  const { data: chapter } = await admin.from("chapters")
    .select("id, city, active").eq("id", chapterId).maybeSingle();
  if (!chapter) return NextResponse.json({ error: "No such chapter." }, { status: 404 });

  const capacity = b.capacity == null || b.capacity === "" ? null : Number(b.capacity);
  if (capacity != null && (!Number.isFinite(capacity) || capacity < 1))
    return NextResponse.json({ error: "Capacity must be a number of seats, or left blank." }, { status: 400 });

  const { data: event, error } = await admin.from("chapter_events").insert({
    chapter_id: chapterId,
    title: title.slice(0, 160),
    details: String(b.details ?? "").slice(0, 4000),
    starts_at: when.toISOString(),
    ends_at: b.ends_at ? new Date(b.ends_at).toISOString() : null,
    venue: b.venue ? String(b.venue).slice(0, 300) : null,
    joining_link: b.joining_link ? String(b.joining_link).slice(0, 500) : null,
    capacity,
    guests: b.guests ? String(b.guests).slice(0, 500) : null,
    created_by: perm.userId
  }).select("id, title, starts_at").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /**
   * Nobody is emailed from here.
   *
   * The members of a chapter see it on their chapter page, and a send would
   * come out of the same daily allowance that application receipts depend on.
   * If an announcement is wanted it goes through the composer, where the
   * allowance and the repeat check both apply.
   */
  return NextResponse.json({
    ok: true, event,
    message: `${event.title} is on the ${chapter.city} chapter page. Members of that chapter can RSVP now.`
  });
}

export async function PATCH(request: Request) {
  const perm = await requirePermission("chapters.manage");
  if (!perm.ok) return perm.response;

  const b = await request.json().catch(() => ({} as any));
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const patch: Record<string, any> = {};

  // Cancelling keeps the row and the RSVPs. Deleting would lose the record of
  // who had made plans, and the page needs to be able to say it was called off
  // rather than quietly show nothing.
  if (b.cancelled === true) patch.cancelled_at = new Date().toISOString();
  if (b.cancelled === false) patch.cancelled_at = null;

  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 160);
  if (typeof b.details === "string") patch.details = b.details.slice(0, 4000);
  if (typeof b.venue === "string") patch.venue = b.venue.slice(0, 300) || null;
  if (typeof b.joining_link === "string") patch.joining_link = b.joining_link.slice(0, 500) || null;
  if (typeof b.guests === "string") patch.guests = b.guests.slice(0, 500) || null;
  if (b.starts_at) {
    const when = new Date(b.starts_at);
    if (Number.isNaN(when.getTime()))
      return NextResponse.json({ error: "That start time is not a date." }, { status: 400 });
    patch.starts_at = when.toISOString();
  }
  if (b.capacity !== undefined) {
    const cap = b.capacity == null || b.capacity === "" ? null : Number(b.capacity);
    if (cap != null && (!Number.isFinite(cap) || cap < 1))
      return NextResponse.json({ error: "Capacity must be a number of seats, or left blank." }, { status: 400 });
    patch.capacity = cap;
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await admin.from("chapter_events").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, message: patch.cancelled_at ? "Meetup cancelled." : "Meetup updated." });
}
