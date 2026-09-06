"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/apiClient";
import { TOKENS, DEFAULT_SUBJECT, DEFAULT_BODY } from "@/lib/interviewEmail";

/**
 * Invite many candidates to interview, each at their own time.
 *
 * The schedule is always previewed before anything is written or sent.
 * Thirty three invitations cannot be recalled, and a wrong start date or a
 * daily window that is too narrow is obvious on a preview and invisible in a
 * form.
 */
export function BulkInterview({ applicationIds, onDone }: {
  applicationIds: string[]; onDone?: () => void;
}) {
  const router = useRouter();
  const today = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(today);
  // Default to a single day. Spreading a batch over a week should be a
  // decision, not something that happens because nobody set an end date.
  const [endDate, setEndDate] = useState(today);
  const [dayStart, setDayStart] = useState("09:00");
  const [dayEnd, setDayEnd] = useState("17:00");
  const [slotMinutes, setSlotMinutes] = useState("30");
  const [gapMinutes, setGapMinutes] = useState("15");
  const [lunch, setLunch] = useState(true);
  const [weekends, setWeekends] = useState(false);
  const [mode, setMode] = useState("video");
  const [where, setWhere] = useState("");
  const [subjectTpl, setSubjectTpl] = useState(DEFAULT_SUBJECT);
  const [bodyTpl, setBodyTpl] = useState(DEFAULT_BODY);
  const [editing, setEditing] = useState(false);
  // One day or several. Made an explicit choice rather than something that
  // happens because an end date was left alone.
  const [spread, setSpread] = useState<"one_day" | "range">("one_day");

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const rules = () => ({
    start_date: startDate,
    // In one-day mode the window is a single date, so nothing can spill.
    end_date: spread === "one_day" ? startDate : (endDate || null),
    day_start: dayStart, day_end: dayEnd,
    slot_minutes: Number(slotMinutes), gap_minutes: Number(gapMinutes),
    break_start: lunch ? "13:00" : null, break_end: lunch ? "14:00" : null,
    weekdays: weekends ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
    timezone: "Africa/Lagos"
  });

  async function run(commit: boolean) {
    setBusy(true); setErr(null);
    try {
      const r = await postJson("/api/admin/interviews/bulk", {
        application_ids: applicationIds, rules: rules(),
        mode, location_or_link: where,
        subject_template: subjectTpl, body_template: bodyTpl, preview: !commit
      });
      if (!r.ok) { setErr(r.error); return; }
      if (commit) {
        setDone(r.data?.message ?? "Sent.");
        setPreview(null);
        setTimeout(() => { router.refresh(); onDone?.(); }, 1500);
      } else {
        setPreview(r.data);
      }
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="card p-5">
        <div className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mb-3">✓</div>
        <p className="font-semibold">{done}</p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold text-lg">
          Invite {applicationIds.length} candidate{applicationIds.length === 1 ? "" : "s"} to interview
        </h3>
        <p className="text-sm text-muted-2 mt-1">
          Each person gets their own time slot, inside the dates you set. Nothing is sent until you
          have seen the schedule.
        </p>
      </div>

      {err && (
        <div className="rounded-xl border border-coral/40 p-3" style={{ background: "#FFF4F2" }}>
          <p className="text-sm text-ink">{err}</p>
        </div>
      )}

      <div className="inline-flex rounded-pill border border-line overflow-hidden">
        {([["one_day", "All on one day"], ["range", "Across several days"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setSpread(v)}
            className={`px-4 h-9 text-sm font-semibold transition ${
              spread === v ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label !text-xs">{spread === "one_day" ? "Interview date" : "From"}</label>
          <input className="input !h-10 text-sm" type="date" value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate && e.target.value > endDate) setEndDate(e.target.value);
            }} />
        </div>
        {spread === "range" && (
          <div>
            <label className="label !text-xs">To</label>
            <input className="input !h-10 text-sm" type="date" value={endDate} min={startDate}
              onChange={(e) => setEndDate(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label !text-xs">Day starts</label>
          <input className="input !h-10 text-sm" type="time" value={dayStart}
            onChange={(e) => setDayStart(e.target.value)} />
        </div>
        <div>
          <label className="label !text-xs">Day ends</label>
          <input className="input !h-10 text-sm" type="time" value={dayEnd}
            onChange={(e) => setDayEnd(e.target.value)} />
        </div>
        <div>
          <label className="label !text-xs">Each interview</label>
          <select className="input !h-10 text-sm" value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}>
            {["15", "20", "30", "45", "60"].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </div>
        <div>
          <label className="label !text-xs">Gap between</label>
          <select className="input !h-10 text-sm" value={gapMinutes}
            onChange={(e) => setGapMinutes(e.target.value)}>
            {["0", "5", "10", "15", "30"].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </div>
        <div>
          <label className="label !text-xs">Mode</label>
          <select className="input !h-10 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="video">Video call</option>
            <option value="phone">Phone</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label !text-xs">
            {mode === "in_person" ? "Address" : "Interview link"}
          </label>
          <input className="input !h-10 text-sm" value={where} onChange={(e) => setWhere(e.target.value)}
            placeholder={mode === "in_person" ? "14 Adeshina Street, Ikeja" : "https://meet.google.com/..."} />
        </div>
      </div>

      {(() => {
        const per = Number(slotMinutes) + Number(gapMinutes);
        const mins = (Number(dayEnd.split(":")[0]) * 60 + Number(dayEnd.split(":")[1]))
          - (Number(dayStart.split(":")[0]) * 60 + Number(dayStart.split(":")[1]))
          - (lunch ? 60 : 0);
        const fit = Math.max(0, Math.floor(mins / per));
        const enough = fit >= applicationIds.length;
        return (
          <p className={`text-xs ${enough ? "text-muted-2" : "text-coral font-medium"}`}>
            About <strong>{fit}</strong> interviews fit in one day at these settings
            {enough
              ? `, so all ${applicationIds.length} can be done in a single day.`
              : `. For all ${applicationIds.length} in one day you would need shorter slots, a longer day, or a smaller gap. Otherwise extend the end date.`}
          </p>
        );
      })()}

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={lunch}
            onChange={(e) => setLunch(e.target.checked)} />
          Keep 13:00 to 14:00 free
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={weekends}
            onChange={(e) => setWeekends(e.target.checked)} />
          Use weekends too
        </label>
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ink">The invitation email</span>
          <button className="text-xs text-muted hover:text-ink underline" onClick={() => setEditing((e) => !e)}>
            {editing ? "Hide" : "Edit the wording"}
          </button>
          {(subjectTpl !== DEFAULT_SUBJECT || bodyTpl !== DEFAULT_BODY) && (
            <button className="text-xs text-muted-2 hover:text-coral underline"
              onClick={() => { setSubjectTpl(DEFAULT_SUBJECT); setBodyTpl(DEFAULT_BODY); }}>
              Reset to default
            </button>
          )}
        </div>

        {editing && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="label !text-xs">Subject</label>
              <input className="input !h-10 text-sm" value={subjectTpl}
                onChange={(e) => setSubjectTpl(e.target.value)} />
            </div>
            <div>
              <label className="label !text-xs">Message</label>
              <textarea className="input text-sm" style={{ minHeight: "16rem" }} value={bodyTpl}
                onChange={(e) => setBodyTpl(e.target.value)} />
              <p className="text-xs text-muted-2 mt-1.5">
                Leave a blank line between paragraphs. Each candidate gets their own date and time.
              </p>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1.5">
                Click to insert
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TOKENS.map((t) => (
                  <button key={t.token} title={t.means}
                    onClick={() => setBodyTpl((b) => b + " " + t.token)}
                    className="rounded-pill border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-coral hover:text-coral transition">
                    {t.token}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!preview ? (
        <button className="btn-coral" onClick={() => run(false)} disabled={busy || !applicationIds.length}>
          {busy ? "Working out the schedule…" : "Preview the schedule"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-paper-2 p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span><strong className="text-ink">{preview.count}</strong> interviews</span>
              <span><strong className="text-ink">{preview.summary?.days}</strong> days</span>
              <span className="text-muted-2">{preview.summary?.first} to {preview.summary?.last}</span>
            </div>
            {preview.summary?.per_day && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(preview.summary.per_day).map(([d, n]: any) => (
                  <span key={d} className="rounded-pill bg-white border border-line px-2.5 py-1 text-xs">
                    {d}: {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          {preview.notes?.length > 0 && (
            <div className="rounded-xl border border-coral/40 p-3" style={{ background: "#FFF4F2" }}>
              {preview.notes.map((n: string, i: number) => (
                <p key={i} className="text-sm text-ink mb-1 last:mb-0">{n}</p>
              ))}
            </div>
          )}

          {/* The email as the first candidate will actually receive it,
              rendered from their real slot rather than placeholder values. */}
          {preview.sample && (
            <div className="rounded-xl border border-line overflow-hidden">
              <div className="bg-paper-2 px-4 py-2 border-b border-line">
                <div className="text-xs font-bold uppercase tracking-widest text-muted">
                  Email preview
                </div>
                <div className="text-xs text-muted-2 mt-1">
                  As {preview.sample.name} will receive it. Everyone else gets the same wording with
                  their own date and time.
                </div>
              </div>
              <div className="p-4 bg-white">
                <div className="text-xs text-muted-2 mb-1">To: {preview.sample.to}</div>
                <div className="text-sm font-semibold text-ink mb-3 pb-3 border-b border-line">
                  {preview.sample.subject}
                </div>
                <div className="text-sm text-muted whitespace-pre-wrap leading-relaxed">
                  {preview.sample.body}
                </div>
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-2">
                <tr className="text-left text-xs text-muted-2 border-b border-line">
                  <th className="py-2 px-3 font-semibold">Candidate</th>
                  <th className="py-2 px-3 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {preview.schedule?.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-2 px-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-2">{s.email}</div>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">{s.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-coral" onClick={() => run(true)} disabled={busy}>
              {busy ? "Sending…" : `Send ${preview.count} invitations`}
            </button>
            <button className="btn-ghost" onClick={() => setPreview(null)} disabled={busy}>
              Change the times
            </button>
          </div>
          <p className="text-xs text-muted-2">
            Sending writes each interview and emails each candidate their own time. It cannot be undone
            from here, so check the list above first.
          </p>
        </div>
      )}
    </div>
  );
}
