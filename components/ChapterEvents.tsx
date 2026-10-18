"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/apiClient";

export type ChapterEvent = {
  id: string;
  title: string;
  details: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  joining_link: string | null;
  capacity: number | null;
  guests: string | null;
  cancelled_at: string | null;
  /** How many members said yes. A number, never the list of who. */
  going: number;
  /** This member's own answer, if they have given one. */
  mine: "going" | "not_going" | null;
};

function when(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-GB", { weekday: "short" }),
    date: d.getDate(),
    month: d.toLocaleDateString("en-GB", { month: "long" }),
    time: d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })
  };
}

/**
 * The chapter's meetups, with an RSVP that answers immediately.
 *
 * The attendance figure is a count the server computed. Members never receive
 * the list of who else is coming: a verified directory of high achievers with
 * their movements attached is not something to hand out, even inside the
 * room.
 */
export function ChapterEvents({ events }: { events: ChapterEvent[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, { mine: string; going: number }>>({});
  const [err, setErr] = useState<string | null>(null);

  async function answer(id: string, response: "going" | "not_going") {
    setBusy(id); setErr(null);
    const res = await postJson("/api/elite/events/rsvp", { event_id: id, response });
    setBusy(null);
    if (!res.ok) { setErr(res.error); return; }
    setLocal((s) => ({ ...s, [id]: { mine: res.data.response, going: res.data.going } }));
    // Keeps the figure right for anyone who lands on this page next.
    router.refresh();
  }

  if (!events.length)
    return (
      <div className="card p-8 text-center">
        <div className="font-display font-semibold text-lg mb-1">Nothing in the diary yet.</div>
        <p className="text-sm text-muted-2">
          Chapter meetups are posted here. You will see them the moment one is set for your city.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      {err && <p className="text-sm font-semibold text-coral">{err}</p>}

      {events.map((e) => {
        const w = when(e.starts_at);
        const mine = local[e.id]?.mine ?? e.mine;
        const going = local[e.id]?.going ?? e.going;
        const past = new Date(e.starts_at).getTime() < Date.now();
        const full = e.capacity != null && going >= e.capacity && mine !== "going";

        return (
          <div key={e.id}
            className={`relative overflow-hidden rounded-card border p-6 ${e.cancelled_at ? "border-line bg-paper-2" : "border-white/10 bg-ink text-white"}`}>
            {!e.cancelled_at && (
              <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-coral/[.14] blur-3xl" aria-hidden="true" />
            )}
            <div className="relative flex flex-wrap items-start gap-6">

              <div className={`shrink-0 text-center rounded-xl px-5 py-3 ${e.cancelled_at ? "bg-white border border-line" : "bg-white/[.08] border border-white/15"}`}>
                <div className={`text-[10px] font-extrabold uppercase tracking-[.18em] ${e.cancelled_at ? "text-muted" : "text-[#FFB4AC]"}`}>{w.day}</div>
                <div className="font-display font-semibold text-3xl leading-tight">{w.date}</div>
                <div className={`text-[11px] ${e.cancelled_at ? "text-muted-2" : "text-mint"}`}>{w.month}</div>
              </div>

              <div className="flex-1 min-w-[240px]">
                <div className="font-display font-semibold text-xl leading-snug">{e.title}</div>
                <div className={`text-xs mt-1.5 ${e.cancelled_at ? "text-muted-2" : "text-mint"}`}>
                  {w.time}{e.venue ? ` · ${e.venue}` : ""}{e.joining_link && !e.venue ? " · online" : ""}
                </div>
                {e.details && (
                  <p className={`text-sm mt-3 leading-relaxed ${e.cancelled_at ? "text-muted" : "text-mint"}`}>{e.details}</p>
                )}
                {e.guests && (
                  <p className={`text-xs mt-3 ${e.cancelled_at ? "text-muted-2" : "text-white/70"}`}>
                    <b>Sitting in:</b> {e.guests}
                  </p>
                )}
                <div className={`text-xs mt-3 ${e.cancelled_at ? "text-muted-2" : "text-mint"}`}>
                  {going} going{e.capacity != null ? ` of ${e.capacity} seats` : ""}
                </div>
              </div>

              <div className="shrink-0 flex flex-col gap-2 min-w-[150px]">
                {e.cancelled_at ? (
                  <span className="text-sm font-bold text-coral">Cancelled</span>
                ) : past ? (
                  <span className="text-sm text-mint">This one has been and gone</span>
                ) : (
                  <>
                    <button
                      className={`min-h-11 px-5 rounded-pill text-sm font-bold transition ${
                        mine === "going" ? "bg-transparent border border-white/30 text-white" : "bg-[#FFB4AC] text-ink"}`}
                      disabled={busy === e.id || (full && mine !== "going")}
                      onClick={() => answer(e.id, mine === "going" ? "not_going" : "going")}>
                      {busy === e.id ? "…" : mine === "going" ? "Going ✓" : full ? "Full" : "I will be there"}
                    </button>
                    {mine === "going" && e.joining_link && (
                      <a href={e.joining_link} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold text-[#FFB4AC] text-center underline">
                        Joining link
                      </a>
                    )}
                    {mine === "not_going" && (
                      <span className="text-xs text-mint text-center">You passed on this one</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
