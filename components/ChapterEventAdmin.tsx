"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson, callApi } from "@/lib/apiClient";

type Chapter = { id: string; city: string; country: string; members: number };
type Row = {
  id: string; chapter_id: string; title: string; starts_at: string;
  venue: string | null; capacity: number | null; cancelled_at: string | null; going: number;
};

/**
 * Staff set the meetups. Members only answer them.
 *
 * The form is deliberately short. A meetup that needs fifteen fields does not
 * get created, and the fields that are here are the ones a member needs to
 * decide whether to turn up: when, where, who is sitting in, and how many
 * seats.
 */
export function ChapterEventAdmin({ chapters, events }: { chapters: Chapter[]; events: Row[] }) {
  const router = useRouter();
  const [chapterId, setChapterId] = useState(chapters[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [link, setLink] = useState("");
  const [capacity, setCapacity] = useState("");
  const [guests, setGuests] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chapter = chapters.find((c) => c.id === chapterId);

  async function create() {
    if (!chapterId || !title.trim() || !startsAt) {
      setErr("Chapter, title and a start time are needed."); return;
    }
    setBusy(true); setErr(null); setNote(null);
    const res = await postJson("/api/admin/chapter-events", {
      chapter_id: chapterId, title, details,
      starts_at: new Date(startsAt).toISOString(),
      venue, joining_link: link, capacity: capacity || null, guests
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setNote(res.data.message);
    setTitle(""); setDetails(""); setStartsAt(""); setVenue(""); setLink(""); setCapacity(""); setGuests("");
    router.refresh();
  }

  async function cancel(id: string, cancelled: boolean) {
    setErr(null); setNote(null);
    const res = await callApi("/api/admin/chapter-events", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, cancelled })
    });
    if (!res.ok) { setErr(res.error); return; }
    setNote(res.data?.message ?? "Updated.");
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-8 items-start">

      <div className="card p-6">
        <h2 className="font-display font-semibold text-lg mb-4">Set a meetup</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="ch" className="label !text-xs">Chapter</label>
            <select id="ch" className="input !h-11" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.city}, {c.country} ({c.members} verified)</option>
              ))}
            </select>
            {chapter && chapter.members === 0 && (
              <p className="text-xs text-coral mt-1.5 font-semibold">
                No verified members in {chapter.city} yet, so nobody would see this.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="t" className="label !text-xs">Title</label>
            <input id="t" className="input !h-11" value={title} maxLength={160}
              placeholder="Breakfast at Ikeja, then a hiring clinic"
              onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label htmlFor="s" className="label !text-xs">Starts</label>
            <input id="s" className="input !h-11" type="datetime-local" value={startsAt}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => setStartsAt(e.target.value)} />
          </div>

          <div>
            <label htmlFor="v" className="label !text-xs">Venue</label>
            <input id="v" className="input !h-11" value={venue} maxLength={300}
              placeholder="14 Adeshina Street, Ikeja"
              onChange={(e) => setVenue(e.target.value)} />
          </div>

          <div>
            <label htmlFor="l" className="label !text-xs">Joining link, if it is online</label>
            <input id="l" className="input !h-11" value={link} maxLength={500}
              placeholder="https://meet.jit.si/…"
              onChange={(e) => setLink(e.target.value)} />
            <p className="text-xs text-muted-2 mt-1.5">Only shown to members who said they are coming.</p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="c" className="label !text-xs">Seats</label>
              <input id="c" className="input !h-11" type="number" min={1} value={capacity}
                placeholder="blank for no limit"
                onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="g" className="label !text-xs">Sitting in</label>
            <input id="g" className="input !h-11" value={guests} maxLength={500}
              placeholder="Three employers from the Lagos pool"
              onChange={(e) => setGuests(e.target.value)} />
          </div>

          <div>
            <label htmlFor="d" className="label !text-xs">What to expect</label>
            <textarea id="d" className="input !h-auto py-2" rows={3} value={details} maxLength={4000}
              onChange={(e) => setDetails(e.target.value)} />
          </div>

          <button className="btn-coral" disabled={busy} onClick={create}>
            {busy ? "Posting…" : "Post to the chapter"}
          </button>

          <p className="text-xs text-muted-2 leading-relaxed">
            Nobody is emailed. It appears on that chapter&rsquo;s page, where its members will see it. An
            announcement by email goes through the composer, where the daily allowance and the repeat check apply.
          </p>
        </div>

        {note && <p className="text-sm font-semibold text-ink mt-4">{note}</p>}
        {err && <p className="text-sm font-semibold text-coral mt-4">{err}</p>}
      </div>

      <div>
        <h2 className="font-display font-semibold text-lg mb-4">In the diary</h2>
        {events.length === 0 ? (
          <div className="card p-8 text-sm text-muted-2">Nothing set yet.</div>
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const ch = chapters.find((c) => c.id === e.chapter_id);
              const past = new Date(e.starts_at).getTime() < Date.now();
              return (
                <div key={e.id} className="card p-5 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-semibold text-sm">
                      {e.title}
                      {e.cancelled_at && <span className="ml-2 text-xs font-bold text-coral">cancelled</span>}
                      {past && !e.cancelled_at && <span className="ml-2 text-xs text-muted-2">past</span>}
                    </div>
                    <div className="text-xs text-muted-2 mt-1">
                      {ch ? `${ch.city} · ` : ""}
                      {new Date(e.starts_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-bold shrink-0">
                    {e.going} going{e.capacity != null ? ` / ${e.capacity}` : ""}
                  </div>
                  <button className="btn-ghost !h-9 text-xs shrink-0"
                    onClick={() => cancel(e.id, !e.cancelled_at)}>
                    {e.cancelled_at ? "Reinstate" : "Cancel"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
