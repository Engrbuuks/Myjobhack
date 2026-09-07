import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { InterviewDesk } from "@/components/InterviewDesk";
import { assembleInterviewRows, splitUpcoming } from "@/lib/interviews";

export default async function AdminInterviews() {
  const supabase = createClient();
  const { data: interviews } = await supabase.from("interviews")
    .select("*").order("scheduled_at", { ascending: true, nullsFirst: true });
  const rows = await assembleInterviewRows(supabase as any, interviews ?? []);
  const { active, past } = splitUpcoming(rows);

  return (
    <>
      <PageHeader title="Interviews"
        sub="Invitations, schedules, competency scorecards and outcomes. Outcomes drive the application pipeline automatically." />
      {/* Grouped by day. A flat list of thirty seven interviews is unreadable
          when what you need to know is who is coming on which day. */}
      {(() => {
        const byDay = new Map<string, typeof active>();
        active.forEach((r) => {
          const key = r.scheduled_at
            ? new Date(r.scheduled_at).toLocaleDateString("en-GB",
                { timeZone: r.timezone || "Africa/Lagos",
                  weekday: "long", day: "numeric", month: "long" })
            : "Time to be confirmed";
          if (!byDay.has(key)) byDay.set(key, []);
          byDay.get(key)!.push(r);
        });
        if (!active.length) return (
          <div className="card p-6 text-sm text-muted mb-8">No interviews scheduled yet.</div>
        );
        return Array.from(byDay.entries()).map(([day, rows]) => (
          <div key={day} className="mb-8">
            <div className="flex flex-wrap items-baseline gap-3 mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">{day}</span>
              <span className="text-xs text-muted-2">
                {rows.length} interview{rows.length === 1 ? "" : "s"}
                {rows[0]?.scheduled_at && rows[rows.length - 1]?.scheduled_at && rows.length > 1 && (
                  <>, {new Date(rows[0].scheduled_at!).toLocaleTimeString("en-GB", { timeZone: rows[0].timezone || "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false })}
                  {" to "}
                  {new Date(rows[rows.length - 1].scheduled_at!).toLocaleTimeString("en-GB", { timeZone: rows[0].timezone || "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false })}</>
                )}
              </span>
            </div>
            <InterviewDesk rows={rows} />
          </div>
        ));
      })()}
      {past.length > 0 && (
        <>
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3 mt-8">History</div>
          <InterviewDesk rows={past} />
        </>
      )}
    </>
  );
}
