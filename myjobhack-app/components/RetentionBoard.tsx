"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Due = {
  id: string; day_marker: number; due_on: string;
  talent: string; employer: string; role: string; is_elite: boolean; overdue: boolean;
};
type Stats = {
  total_placements: number; reached_90: number; left_early: number;
  rate_90: number | null; confidence: string; sample_note: string;
  by_band: { band: string; placements: number; retained: number; rate: number }[];
} | null;

export function RetentionBoard({ due, pendingTotal, stats }:
  { due: Due[]; pendingTotal: number; stats: Stats }) {
  const router = useRouter();
  const [open, setOpen] = useState<Due | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [f, setF] = useState({
    still_employed: true, employer_rating: 0, talent_sentiment: 0,
    employer_notes: "", talent_notes: "", risk_flag: false
  });

  async function submit() {
    if (!open) return;
    setBusy(true); setNote(null); setBad(false);
    const res = await fetch("/api/admin/checkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkin_id: open.id, ...f })
    });
    const j = await res.json();
    setBusy(false);
    if (res.ok) { setNote(j.message); setOpen(null); router.refresh(); setTimeout(() => setNote(null), 4000); }
    else { setNote(j.error ?? "Failed."); setBad(true); }
  }

  return (
    <div className="space-y-5">
      {note && (
        <div className={`fixed top-6 right-6 z-50 max-w-md px-4 py-3 rounded-card text-sm font-semibold shadow-lg ${
          bad ? "bg-coral text-white" : "bg-ink text-white"}`}>
          {note}{bad && <button className="ml-3 underline opacity-80" onClick={() => setNote(null)}>dismiss</button>}
        </div>
      )}

      {/* headline */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className={`card p-4 ${due.length > 0 ? "border-coral/50" : ""}`}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">Check-ins due</div>
          <div className={`font-display font-semibold text-2xl ${due.length ? "text-coral" : ""}`}>{due.length}</div>
          <div className="text-xs text-muted-2 mt-1">{pendingTotal} scheduled in total</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">90-day retention</div>
          <div className="font-display font-semibold text-2xl">
            {stats?.rate_90 != null ? `${stats.rate_90}%` : "—"}
          </div>
          <div className="text-xs text-muted-2 mt-1 capitalize">{stats?.confidence ?? "no data"} confidence</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">Stayed past 90</div>
          <div className="font-display font-semibold text-2xl">{stats?.reached_90 ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">Left early</div>
          <div className="font-display font-semibold text-2xl text-coral">{stats?.left_early ?? 0}</div>
          <div className="text-xs text-muted-2 mt-1">guarantee claims</div>
        </div>
      </div>

      {stats?.sample_note && (
        <div className="card p-3" style={{ background: "#F1F7F6" }}>
          <p className="text-xs text-muted-2">{stats.sample_note}</p>
        </div>
      )}

      {/* by band — the thing no competitor can show */}
      {stats && stats.by_band.length > 0 && (
        <div className="card p-5">
          <div className="font-display font-semibold mb-1">Retention by competency band</div>
          <p className="text-xs text-muted-2 mb-3">
            This is the number no competitor can produce — it needs both pre-hire assessment and post-hire outcome.
          </p>
          <div className="space-y-2.5">
            {stats.by_band.map(b => (
              <div key={b.band}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium capitalize">{b.band}</span>
                  <span className="text-muted-2">{b.retained}/{b.placements} stayed · {b.rate}%</span>
                </div>
                <div className="h-2 rounded-full bg-paper-2 overflow-hidden">
                  <div className="h-full bg-coral rounded-full" style={{ width: `${b.rate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* due list */}
      <div>
        <h3 className="font-display font-semibold text-lg mb-3">Check-ins to make</h3>
        {due.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">
            Nothing due. Check-ins are scheduled automatically at 30, 60 and 90 days after each placement.
          </div>
        ) : (
          <div className="space-y-2">
            {due.map(d => (
              <div key={d.id} className="card p-4 flex flex-wrap items-center gap-3">
                <span className={`px-2.5 py-1 rounded-pill text-[10px] font-bold uppercase tracking-wider ${
                  d.overdue ? "bg-coral text-white" : "bg-paper-2 text-ink"}`}>
                  Day {d.day_marker}
                </span>
                <div className="flex-1 min-w-48">
                  <div className="font-semibold text-sm">
                    {d.talent}
                    {d.is_elite && <span className="ml-2 text-[10px] font-bold uppercase text-coral">Elite</span>}
                  </div>
                  <div className="text-xs text-muted-2 truncate">{d.role} · placed with {d.employer}</div>
                </div>
                <span className={`text-xs ${d.overdue ? "text-coral font-semibold" : "text-muted-2"}`}>
                  due {d.due_on}
                </span>
                <button className="btn-coral !h-9 text-xs" onClick={() => {
                  setF({ still_employed: true, employer_rating: 0, talent_sentiment: 0,
                         employer_notes: "", talent_notes: "", risk_flag: false });
                  setOpen(d);
                }}>Record</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* record modal */}
      {open && (
        <div className="fixed inset-0 bg-ink/50 grid place-items-center z-50 p-4" onClick={() => !busy && setOpen(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4"
            onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-display font-semibold text-lg">Day {open.day_marker} check-in</h3>
              <p className="text-sm text-muted-2">{open.talent} · {open.role} · {open.employer}</p>
            </div>

            <div>
              <label className="label !text-xs">Are they still in the role?</label>
              <div className="flex gap-2">
                {[["Yes", true], ["No — they left", false]].map(([l, v]: any) => (
                  <button key={String(v)} onClick={() => setF({ ...f, still_employed: v })}
                    className={`px-4 h-10 rounded-pill text-sm font-semibold border transition ${
                      f.still_employed === v ? (v ? "bg-ink text-white border-ink" : "bg-coral text-white border-coral")
                                             : "border-line"}`}>{l}</button>
                ))}
              </div>
            </div>

            {f.still_employed && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label !text-xs">Employer rating (1–5)</label>
                    <select className="input !h-10" value={f.employer_rating}
                      onChange={e => setF({ ...f, employer_rating: Number(e.target.value) })}>
                      <option value={0}>—</option>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label !text-xs">How is the hire feeling? (1–5)</label>
                    <select className="input !h-10" value={f.talent_sentiment}
                      onChange={e => setF({ ...f, talent_sentiment: Number(e.target.value) })}>
                      <option value={0}>—</option>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={f.risk_flag}
                    onChange={e => setF({ ...f, risk_flag: e.target.checked })} />
                  Flag as at risk of leaving
                </label>
              </>
            )}

            <div>
              <label className="label !text-xs">What the employer said</label>
              <textarea className="input !h-auto py-2" rows={2} value={f.employer_notes}
                onChange={e => setF({ ...f, employer_notes: e.target.value })} />
            </div>
            <div>
              <label className="label !text-xs">What the hire said</label>
              <textarea className="input !h-auto py-2" rows={2} value={f.talent_notes}
                onChange={e => setF({ ...f, talent_notes: e.target.value })} />
            </div>

            <div className="flex gap-3">
              <button className="btn-coral" onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Save check-in"}
              </button>
              <button className="btn-ghost" onClick={() => setOpen(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
