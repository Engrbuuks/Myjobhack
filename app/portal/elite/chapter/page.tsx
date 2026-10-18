import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ChapterEvents, type ChapterEvent } from "@/components/ChapterEvents";

export default async function ChapterPage() {
  // An RSVP has to show immediately, so this page is not served from the
  // client router cache.
  noStore();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("elite_memberships")
    .select("chapter_id, status").eq("talent_id", user!.id).maybeSingle();

  if (me?.status !== "verified") {
    return <PageHeader title="My chapter" sub="Your chapter unlocks once your membership is verified." />;
  }
  const { data: chapter } = me.chapter_id
    ? await supabase.from("chapters").select("city, country").eq("id", me.chapter_id).single()
    : { data: null as any };
  const { data: members } = me.chapter_id
    ? await supabase.from("elite_memberships")
        .select("talent_id, member_no, distinction")
        .eq("chapter_id", me.chapter_id).eq("status", "verified").order("member_no")
    : { data: [] as any[] };

  const rows = await Promise.all(
    (members ?? []).map(async (m) => {
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from("profiles").select("full_name, city").eq("id", m.talent_id).single(),
        supabase.from("talent_profiles").select("headline").eq("profile_id", m.talent_id).single()
      ]);
      return { ...m, name: p?.full_name ?? "Member", headline: t?.headline ?? m.distinction };
    })
  );

  /**
   * The chapter's diary.
   *
   * Read with the service role for one reason: the attendance figure. A
   * member may see HOW MANY people are coming and must not see WHO, so the
   * count is computed here and the names never leave the server. The RSVP
   * rows themselves are also policy restricted to each member's own.
   */
  const admin = createAdminClient();
  let events: ChapterEvent[] = [];
  if (me.chapter_id) {
    const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: evs } = await admin.from("chapter_events")
      .select("id, title, details, starts_at, ends_at, venue, joining_link, capacity, guests, cancelled_at")
      .eq("chapter_id", me.chapter_id)
      .gte("starts_at", cutoff)
      .order("starts_at", { ascending: true })
      .limit(20);

    const ids = (evs ?? []).map((e: any) => e.id);
    const { data: rsvps } = ids.length
      ? await admin.from("chapter_event_rsvps").select("event_id, profile_id, response").in("event_id", ids)
      : { data: [] as any[] };

    const goingCount = new Map<string, number>();
    const mineByEvent = new Map<string, "going" | "not_going">();
    for (const r of rsvps ?? []) {
      if (r.response === "going") goingCount.set(r.event_id, (goingCount.get(r.event_id) ?? 0) + 1);
      if (r.profile_id === user!.id) mineByEvent.set(r.event_id, r.response);
    }

    events = (evs ?? []).map((e: any) => {
      const mine = mineByEvent.get(e.id) ?? null;
      return {
        ...e,
        /**
         * The joining link is stripped unless this member said they are
         * coming. Rendering it conditionally in the component was not enough:
         * it still travelled to every chapter member in the payload, where it
         * is readable in the page source without answering the invitation.
         */
        joining_link: mine === "going" ? e.joining_link : null,
        going: goingCount.get(e.id) ?? 0,
        mine
      };
    });
  }

  const upcoming = events.filter((e) => !e.cancelled_at && new Date(e.starts_at).getTime() >= Date.now()).length;

  return (
    <>
      <PageHeader title={chapter ? `${chapter.city} Chapter` : "My chapter"}
        sub={`${rows.length} verified member${rows.length === 1 ? "" : "s"} — meet locally, collaborate globally.`} />

      <div className="mb-10">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
          <h2 className="font-display font-semibold text-xl">
            {upcoming > 0 ? "In the diary" : "Meetups"}
          </h2>
          {upcoming > 0 && (
            <span className="text-xs text-muted-2">{upcoming} coming up</span>
          )}
        </div>
        <ChapterEvents events={events} />
      </div>

      <h2 className="font-display font-semibold text-xl mb-4">The members</h2>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((m) => (
          <div key={m.talent_id} className="card p-5">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 shrink-0 rounded-full bg-ink text-white grid place-items-center font-display font-semibold">
                {m.name[0]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{m.name}</div>
                <div className="text-xs text-muted-2 leading-relaxed line-clamp-2">{m.headline}</div>
              </div>
              <span className="text-[10px] font-bold text-muted shrink-0">№ {String(m.member_no).padStart(4, "0")}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
