import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ChapterEventAdmin } from "@/components/ChapterEventAdmin";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Chapter meetups, which is the half of "meet locally, collaborate globally"
 * that did not exist. A chapter was a list of names.
 *
 * The capability is checked here as well as in the route. Hiding the form
 * would not be access control, and the route is the thing that enforces it,
 * but showing a form that cannot be submitted is its own kind of lie.
 */
export default async function AdminChaptersPage() {
  noStore();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const { data: me } = await admin.from("profiles")
    .select("role, permissions").eq("id", user!.id).maybeSingle();

  if (!can(me, "chapters.manage"))
    return (
      <PageHeader title="Chapter meetups"
        sub="You do not have permission to create chapter meetups. Ask an administrator for chapter access." />
    );

  const [{ data: chapters }, { data: events }, { data: members }] = await Promise.all([
    admin.from("chapters").select("id, city, country").eq("active", true).order("city"),
    admin.from("chapter_events")
      .select("id, chapter_id, title, starts_at, venue, capacity, cancelled_at")
      .order("starts_at", { ascending: false }).limit(40),
    admin.from("elite_memberships").select("chapter_id").eq("status", "verified")
  ]);

  // How many verified members each chapter actually has, so a meetup is not
  // posted to an empty city by accident.
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) {
    if (m.chapter_id) memberCount.set(m.chapter_id, (memberCount.get(m.chapter_id) ?? 0) + 1);
  }

  const ids = (events ?? []).map((e: any) => e.id);
  const { data: rsvps } = ids.length
    ? await admin.from("chapter_event_rsvps").select("event_id, response").in("event_id", ids)
    : { data: [] as any[] };
  const going = new Map<string, number>();
  for (const r of rsvps ?? []) {
    if (r.response === "going") going.set(r.event_id, (going.get(r.event_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Chapter meetups"
        sub="Set a date for a chapter and its verified members see it on their own chapter page. Nobody is emailed from here." />
      <ChapterEventAdmin
        chapters={(chapters ?? []).map((c: any) => ({
          id: c.id, city: c.city, country: c.country, members: memberCount.get(c.id) ?? 0
        }))}
        events={(events ?? []).map((e: any) => ({ ...e, going: going.get(e.id) ?? 0 }))}
      />
    </>
  );
}
