"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPhone } from "@/lib/phone";
import {
  type InterviewRow, type Competency,
  filterRows, groupByDay, interviewStats, timeLabel, toCsv
} from "@/lib/interviews";

export type { InterviewRow } from "@/lib/interviews";

const DEFAULT_COMPETENCIES = ["Communication", "Technical depth", "Problem solving", "Role knowledge", "Values fit"];

const STATUS_LABELS: Record<string, string> = {
  invited: "Invited", scheduled: "Scheduled", completed: "Completed",
  no_show: "No show", cancelled: "Cancelled"
};

/* ------------------------------------------------------------------ *
 * The board: filters, counts, bulk actions. Admin interviews page.
 * ------------------------------------------------------------------ */

export function InterviewBoard({ rows, jobs }: {
  rows: InterviewRow[];
  jobs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [job, setJob] = useState("");
  const [status, setStatus] = useState("");
  const [needsOutcome, setNeedsOutcome] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<"delete" | "cancel" | null>(null);

  const stats = useMemo(() => interviewStats(rows), [rows]);

  const visible = useMemo(() => {
    const base = filterRows(rows, { q, job, status, needsOutcome });
    // Without an explicit status filter the board shows what is still live.
    // History is a click away rather than mixed in, because a cancelled
    // interview from last month is not something you scan a morning list for.
    return status || needsOutcome
      ? base
      : base.filter((r) => showPast ? true : ["invited", "scheduled"].includes(r.status));
  }, [rows, q, job, status, needsOutcome, showPast]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  const allVisibleIds = visible.map((r) => r.id);
  const pickedVisible = allVisibleIds.filter((id) => picked.has(id));

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setPicked((s) =>
      pickedVisible.length === allVisibleIds.length ? new Set() : new Set(allVisibleIds));
  }

  const chosen = rows.filter((r) => picked.has(r.id));

  /** Delete the selected interviews outright. One request, not N. */
  async function bulkDelete() {
    setBusy(true); setErr(null); setNote(null);
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_interview", data: { ids: pickedVisible } })
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false); setConfirmBulk(null);
    if (!res.ok) { setErr(json.error ?? "Could not delete those interviews."); return; }
    setNote(json.message ?? `${pickedVisible.length} deleted.`);
    setPicked(new Set());
    router.refresh();
  }

  /**
   * Cancel the selected interviews, one request each because each one sends
   * its own email. Failures are counted rather than aborting the run: a
   * person whose email bounces should not stop the other ten cancellations.
   */
  async function bulkCancel() {
    setBusy(true); setErr(null); setNote(null);
    let ok = 0; const failed: string[] = [];
    for (const r of chosen) {
      const res = await fetch("/api/interviews", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action: "cancel", notify: true, reason: "Cancelled in bulk" })
      });
      res.ok ? ok++ : failed.push(r.name);
    }
    setBusy(false); setConfirmBulk(null);
    setNote(`${ok} cancelled and told by email.` +
      (failed.length ? ` ${failed.length} failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}` : ""));
    setPicked(new Set());
    router.refresh();
  }

  function download() {
    const csv = toCsv(visible);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `interviews-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function copyEmails() {
    const list = (pickedVisible.length ? chosen : visible).map((r) => r.email).filter(Boolean);
    navigator.clipboard?.writeText(list.join(", "));
    setNote(`${list.length} email address${list.length === 1 ? "" : "es"} copied.`);
  }

  return (
    <div>
      {/* ---- the numbers worth seeing before the list ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat label="Today" value={stats.today} hint="interviews in Lagos time" />
        <Stat label="Next 7 days" value={stats.next7} />
        <Stat label="Awaiting a time" value={stats.unscheduled}
          hint={stats.unscheduled ? "candidate has not picked a slot" : undefined} />
        <Stat label="Time has passed" value={stats.pastDue} warn={stats.pastDue > 0}
          hint={stats.pastDue ? "still marked as upcoming" : undefined} />
        <Stat label="Needs an outcome" value={stats.needsOutcome} warn={stats.needsOutcome > 0}
          hint={stats.needsOutcome ? "held at interviewing until scored" : undefined} />
      </div>

      {/* ---- filters ---- */}
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
        <input className="input !h-10 text-sm flex-1 min-w-48" value={q}
          placeholder="Search name, email, phone or role…"
          onChange={(e) => setQ(e.target.value)} />
        <select className="input !h-10 text-sm !w-auto" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">All jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select className="input !h-10 text-sm !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Live only</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap"
          title="Interviews that have happened but have no verdict, and interviews still open after their time">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={needsOutcome}
            onChange={(e) => setNeedsOutcome(e.target.checked)} />
          Needs attention
        </label>
        {!status && !needsOutcome && (
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)} />
            Include history
          </label>
        )}
        <button className="btn-ghost !h-10 text-xs" onClick={download} disabled={!visible.length}>
          Export CSV
        </button>
        <button className="btn-ghost !h-10 text-xs" onClick={copyEmails} disabled={!visible.length}>
          Copy emails
        </button>
        {(q || job || status || needsOutcome) && (
          <button className="text-xs font-semibold text-muted hover:text-coral"
            onClick={() => { setQ(""); setJob(""); setStatus(""); setNeedsOutcome(false); }}>
            Clear
          </button>
        )}
      </div>

      {note && <p className="text-sm text-ink mb-3">{note}</p>}
      {err && <p className="text-sm text-coral mb-3">{err}</p>}

      {/* ---- selection bar ---- */}
      {!!visible.length && (
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4"
              checked={pickedVisible.length > 0 && pickedVisible.length === allVisibleIds.length}
              onChange={toggleAll} />
            <span className="text-muted">
              {pickedVisible.length ? `${pickedVisible.length} selected` : `Select all ${visible.length}`}
            </span>
          </label>
          {pickedVisible.length > 0 && (
            <>
              <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy}
                onClick={() => setConfirmBulk(confirmBulk === "cancel" ? null : "cancel")}>
                Cancel selected
              </button>
              <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy}
                onClick={() => setConfirmBulk(confirmBulk === "delete" ? null : "delete")}>
                Delete selected
              </button>
              <button className="text-xs font-semibold text-muted hover:text-coral"
                onClick={() => setPicked(new Set())}>Clear selection</button>
            </>
          )}
        </div>
      )}

      {confirmBulk && (
        <div className="card p-4 mb-4 border-coral">
          {confirmBulk === "cancel" ? (
            <>
              <div className="font-semibold text-sm mb-1">
                Cancel {pickedVisible.length} interview{pickedVisible.length === 1 ? "" : "s"}?
              </div>
              <p className="text-xs text-muted-2 mb-3">
                Each person is emailed to say it is off, the record is kept, their slot is freed,
                and their application goes back to shortlisted. This is what you want when people
                were told about a time that is no longer happening.
              </p>
              <button className="btn-coral !h-9 text-sm" disabled={busy} onClick={bulkCancel}>
                {busy ? "Cancelling…" : "Cancel them and send the emails"}
              </button>
            </>
          ) : (
            <>
              <div className="font-semibold text-sm mb-1">
                Delete {pickedVisible.length} interview{pickedVisible.length === 1 ? "" : "s"}?
              </div>
              <p className="text-xs text-muted-2 mb-3">
                The records are removed and nobody is emailed. Use this for test rows and
                mistakes. If these people were already invited, cancel instead, or they will
                turn up for an interview that no longer exists anywhere.
              </p>
              <button className="btn-coral !h-9 text-sm" disabled={busy} onClick={bulkDelete}>
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </>
          )}
          <button className="text-xs font-semibold text-muted ml-3" onClick={() => setConfirmBulk(null)}>
            Keep them
          </button>
        </div>
      )}

      {/* ---- the list, by day ---- */}
      {!visible.length && (
        <div className="card p-10 text-center text-sm text-muted">
          {rows.length
            ? "No interviews match these filters."
            : "No interviews yet. Schedule from any applicant list, singly or in bulk."}
        </div>
      )}

      {groups.map((g) => {
        const first = g.rows[0], last = g.rows[g.rows.length - 1];
        return (
          <div key={g.key || "unscheduled"} className="mb-8">
            <div className="flex flex-wrap items-baseline gap-3 mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">{g.label}</span>
              <span className="text-xs text-muted-2">
                {g.rows.length} interview{g.rows.length === 1 ? "" : "s"}
                {g.rows.length > 1 && first.scheduled_at && last.scheduled_at &&
                  `, ${timeLabel(first)} to ${timeLabel(last)}`}
              </span>
              <button className="text-xs font-semibold text-muted hover:text-coral"
                onClick={() => setPicked((s) => {
                  const next = new Set(s);
                  const all = g.rows.every((r) => next.has(r.id));
                  g.rows.forEach((r) => all ? next.delete(r.id) : next.add(r.id));
                  return next;
                })}>
                {g.rows.every((r) => picked.has(r.id)) ? "Deselect day" : "Select day"}
              </button>
            </div>
            <div className="space-y-3">
              {g.rows.map((r) => (
                <InterviewCard key={r.id} r={r}
                  picked={picked.has(r.id)} onPick={() => toggle(r.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">{label}</div>
      <div className={`font-display font-semibold text-2xl mt-1 ${warn && value ? "text-coral" : ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-2 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A plain list of rows, no toolbar. Employer interviews page.
 * ------------------------------------------------------------------ */

export function InterviewDesk({ rows }: { rows: InterviewRow[] }) {
  if (!rows.length)
    return <div className="card p-10 text-center text-sm text-muted">No interviews here yet — invite candidates from any applicant list.</div>;
  return (
    <div className="space-y-3">
      {rows.map((r) => <InterviewCard key={r.id} r={r} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One interview
 * ------------------------------------------------------------------ */

function InterviewCard({ r, picked, onPick }: {
  r: InterviewRow; picked?: boolean; onPick?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"cancel" | "move" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [shareReason, setShareReason] = useState(false);
  const [notify, setNotify] = useState(true);
  const [newWhen, setNewWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resumeErr, setResumeErr] = useState<string | null>(null);

  /**
   * Whether this interview's time has already gone by.
   *
   * Worked out after mounting rather than during render: the server and the
   * browser read the clock at different moments, and a value that differs
   * between the two makes React discard the markup it was given and warn.
   */
  const [overdue, setOverdue] = useState(false);
  useEffect(() => {
    setOverdue(
      ["invited", "scheduled"].includes(r.status) &&
      !!r.scheduled_at && new Date(r.scheduled_at) < new Date()
    );
  }, [r.status, r.scheduled_at]);

  async function call(body: Record<string, any>) {
    setBusy(true); setErr(null);
    const res = await fetch("/api/interviews", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, ...body })
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "That did not work."); return false; }
    setPanel(null);
    router.refresh();
    return true;
  }

  async function remove() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_interview", id: r.id })
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "Could not delete it."); return; }
    router.refresh();
  }

  /**
   * Résumés come back as a file from a gated endpoint, not a public URL, so
   * they are fetched and handed to the browser as a blob. Opening the endpoint
   * directly in a tab shows a JSON error page when anything is wrong, which
   * reads as "the CV is broken".
   */
  async function openResume() {
    if (!r.resumeUrl) return;
    setResumeErr(null);
    try {
      const res = await fetch(r.resumeUrl);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setResumeErr(j.error ?? "That CV could not be opened.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setResumeErr("That CV could not be opened.");
    }
  }

  const live = ["invited", "scheduled"].includes(r.status);

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start gap-4">
        {onPick && (
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4 mt-1" checked={!!picked} onChange={onPick} />
        )}

        <div className="flex-1 min-w-56">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-sm">{r.name}</span>
            {r.isGuest && (
              <span className="rounded-pill bg-paper-2 border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-2">
                guest
              </span>
            )}
            <span className="text-muted-2 text-sm">{r.jobTitle}</span>
            {r.company && <span className="text-muted-2 text-xs">· {r.company}</span>}
          </div>

          {/* The time is what you scan this list for, so it leads. */}
          <div className="font-display font-semibold text-base text-ink mt-1">
            {r.scheduled_at
              ? new Date(r.scheduled_at).toLocaleString("en-GB", {
                  timeZone: r.timezone, weekday: "short", day: "numeric", month: "short",
                  hour: "2-digit", minute: "2-digit", hour12: false })
              : r.calendly_url ? "Awaiting the candidate's slot pick" : "Time to be confirmed"}
            {r.duration_min ? <span className="text-muted-2 font-normal text-sm"> for {r.duration_min} minutes</span> : null}
            <span className="text-muted-2 font-normal text-xs"> {r.timezone}</span>
            {overdue && (
              <span className="ml-2 rounded-pill bg-coral-soft text-coral px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                title="This time has passed and the interview is still open. Score it, or mark a no-show.">
                time passed
              </span>
            )}
          </div>

          {/* Contact details and the CV, so you can prepare without leaving. */}
          <div className="text-xs text-muted-2 mt-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center">
            {r.email && <a href={`mailto:${r.email}`} className="hover:text-coral">{r.email}</a>}
            {r.phone
              ? <a href={`tel:${r.phone}`} className="hover:text-coral">{formatPhone(r.phone)}</a>
              : <span className="text-muted-2">no phone on file</span>}
            <span>Round {r.round}</span>
            <span>{r.mode.replace(/_/g, " ")}</span>
            {r.location_or_link && (
              /^https?:\/\//.test(r.location_or_link)
                ? <a href={r.location_or_link} target="_blank" rel="noopener" className="text-coral font-semibold hover:underline">Interview link ↗</a>
                : <span>{r.location_or_link}</span>
            )}
            {r.resumeUrl
              ? <button onClick={openResume} className="text-coral font-semibold hover:underline">CV ↗</button>
              : <span className="text-muted-2">no CV</span>}
            {r.applicantHref && (
              <a href={r.applicantHref} className="text-coral font-semibold hover:underline">Application →</a>
            )}
            {r.fitScore != null && <span>Fit {Math.round(Number(r.fitScore))}</span>}
            {r.batchId && <span title="Scheduled as part of a bulk run">batch</span>}
          </div>
          {resumeErr && <p className="text-coral text-xs mt-1">{resumeErr}</p>}
          {r.status === "cancelled" && r.cancelReason && (
            <p className="text-xs text-muted-2 mt-1">
              Cancelled: {r.cancelReason}{r.cancelNotified ? ", candidate told" : ", candidate NOT told"}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`px-2.5 py-1 rounded-pill text-xs font-bold ${
            r.status === "scheduled" ? "bg-ink text-white" :
            r.status === "completed" ? "bg-paper-2 text-muted" :
            r.status === "invited" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted line-through"}`}>
            {STATUS_LABELS[r.status] ?? r.status}
          </span>
          {r.outcome !== "pending" && (
            <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
              r.outcome === "advanced" ? "bg-coral text-white" : "bg-paper-2 text-muted"}`}>
              {r.outcome}
            </span>
          )}

          {r.status === "invited" && (
            <button className="btn-ghost !h-9 text-xs" disabled={busy}
              onClick={() => call({ action: "mark_scheduled" })}>Mark scheduled</button>
          )}
          {live && (
            <>
              <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy}
                onClick={() => call({ action: "no_show" })}>No-show</button>
              <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy}
                onClick={() => { setPanel(panel === "move" ? null : "move"); setNewWhen(""); }}>
                {panel === "move" ? "Keep the time" : "Move"}
              </button>
              <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy}
                onClick={() => { setPanel(panel === "cancel" ? null : "cancel"); setReason(""); setShareReason(false); setNotify(true); }}>
                {panel === "cancel" ? "Keep it" : "Cancel"}
              </button>
            </>
          )}
          {/* Delete is available at every status now. It was hidden on live
              interviews, which left no way to clear a test row or a mistake
              short of cancelling it and emailing a real candidate. */}
          <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy}
            onClick={() => setPanel(panel === "delete" ? null : "delete")}>
            {panel === "delete" ? "Keep it" : "Delete"}
          </button>
          <button className="text-coral text-sm font-semibold" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Review →"}
          </button>
        </div>
      </div>

      {err && <p className="text-coral text-sm mt-2">{err}</p>}

      {panel === "cancel" && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          <div className="text-sm font-semibold text-ink">Cancel {r.name}&rsquo;s interview?</div>
          <p className="text-xs text-muted-2">
            The time is freed for someone else, and the application goes back to shortlisted.
            Nothing is deleted, so you can still see what they were originally told.
          </p>
          <input className="input !h-10 text-sm" value={reason} placeholder="Reason, for your records"
            onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={notify}
                onChange={(e) => setNotify(e.target.checked)} />
              Tell {r.name.split(" ")[0]} by email
            </label>
            {notify && reason.trim() && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={shareReason}
                  onChange={(e) => setShareReason(e.target.checked)} />
                Include the reason in the email
              </label>
            )}
          </div>
          {!notify && (
            <p className="text-xs text-coral">
              They will not be told, and will still have an invitation for a time that no
              longer exists. Only leave this unticked if you are telling them another way.
            </p>
          )}
          <button className="btn-coral !h-9 text-sm" disabled={busy}
            onClick={() => call({ action: "cancel", reason, share_reason: shareReason, notify })}>
            {busy ? "Cancelling…" : "Cancel this interview"}
          </button>
        </div>
      )}

      {panel === "move" && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          <div className="text-sm font-semibold text-ink">Move {r.name}&rsquo;s interview</div>
          <p className="text-xs text-muted-2">
            One email is sent stating the new time. Better than cancelling and rebooking,
            which sends two messages that can arrive in either order.
          </p>
          <input className="input !h-10 text-sm !w-auto" type="datetime-local" value={newWhen}
            onChange={(e) => setNewWhen(e.target.value)} />
          <button className="btn-coral !h-9 text-sm" disabled={busy || !newWhen}
            onClick={() => call({ action: "reschedule", scheduled_at: new Date(newWhen).toISOString() })}>
            {busy ? "Moving…" : "Move and tell them"}
          </button>
        </div>
      )}

      {panel === "delete" && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          <div className="text-sm font-semibold text-ink">Delete this interview record?</div>
          <p className="text-xs text-muted-2">
            It is removed completely and {r.name.split(" ")[0]} is <b>not</b> emailed.
            {live && " They were invited, so unless you are telling them another way, use Cancel instead."}
            {r.applicationId && " Their application goes back to shortlisted."}
          </p>
          <button className="btn-coral !h-9 text-sm" disabled={busy} onClick={remove}>
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      )}

      {open && (
        <Review r={r} busy={busy}
          onSave={(scorecard, feedback) => call({ action: "save_review", scorecard, feedback })}
          onOutcome={(outcome) => call({ action: "outcome", outcome })} />
      )}
    </div>
  );
}

function Review({ r, busy, onSave, onOutcome }: {
  r: InterviewRow; busy: boolean;
  onSave: (s: Competency[], f: string) => Promise<boolean>;
  onOutcome: (o: string) => Promise<boolean>;
}) {
  const seed: Competency[] = r.scorecard?.length
    ? r.scorecard
    : DEFAULT_COMPETENCIES.map((name) => ({ name, rating: 0 }));
  const [scores, setScores] = useState<Competency[]>(seed);
  const [feedback, setFeedback] = useState(r.feedback ?? "");
  const [custom, setCustom] = useState("");
  const [saved, setSaved] = useState(false);

  const setRating = (i: number, rating: number) =>
    setScores((s) => s.map((x, idx) => (idx === i ? { ...x, rating } : x)));

  const avg = (() => {
    const rated = scores.filter((s) => s.rating > 0);
    return rated.length ? (rated.reduce((a, s) => a + s.rating, 0) / rated.length).toFixed(1) : null;
  })();

  return (
    <div className="mt-4 pt-4 border-t border-line grid lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">Competency scorecard</div>
          {avg && <span className="font-display font-semibold text-lg">{avg}<span className="text-muted-2 text-sm">/5</span></span>}
        </div>
        <div className="space-y-2.5">
          {scores.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm flex-1">{s.name}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button"
                    className={`w-8 h-8 rounded-full border text-xs font-bold transition ${
                      s.rating >= n ? "bg-coral border-coral text-white" : "border-line text-muted hover:border-coral"}`}
                    onClick={() => setRating(i, s.rating === n ? 0 : n)}>{n}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input className="input !h-9 flex-1 text-sm" placeholder="Add competency…"
            value={custom} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                setScores((s) => [...s, { name: custom.trim(), rating: 0 }]); setCustom("");
              }
            }} />
          <button className="btn-ghost !h-9 text-xs" onClick={() => {
            if (custom.trim()) { setScores((s) => [...s, { name: custom.trim(), rating: 0 }]); setCustom(""); }
          }}>＋</button>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Notes &amp; verdict</div>
        <textarea className="input !h-auto py-2.5 mb-3" rows={5}
          placeholder="Strengths, concerns, next-round focus…"
          value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn-ghost !h-10 w-full justify-center mb-3" disabled={busy}
          onClick={async () => { const ok = await onSave(scores, feedback); if (ok) setSaved(true); }}>
          {saved ? "Saved ✓" : "Save review"}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-coral !h-10 !px-2 justify-center text-xs" disabled={busy}
            onClick={() => onOutcome("advanced")}>Advance ✓</button>
          <button className="inline-flex items-center justify-center h-10 rounded-pill border border-line text-xs font-bold hover:border-coral transition" disabled={busy}
            onClick={() => onOutcome("hold")}>Hold</button>
          <button className="inline-flex items-center justify-center h-10 rounded-pill border border-line text-xs font-bold text-muted hover:border-coral hover:text-coral transition" disabled={busy}
            onClick={() => onOutcome("rejected")}>Reject</button>
        </div>
        <p className="text-[11px] text-muted-2 mt-2 leading-relaxed">
          Advance → application becomes <b>offered</b>. Reject → <b>rejected</b>. Hold keeps it at interviewing. The candidate is notified either way.
        </p>
      </div>
    </div>
  );
}
