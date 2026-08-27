"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fill gaps in a job's answers, two ways.
 *
 * Ask the applicants is the accurate route and should be tried first — the
 * answer comes from the person. Scanning résumés is the fallback for whoever
 * never replies, and it produces a hint, not an answer.
 */
export function GapFiller({ jobId, formFields }: {
  jobId: string;
  formFields: { id: string; label: string; type: string; options?: string[] | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState("");
  const [rescan, setRescan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const askable = formFields.filter((f) =>
    ["select", "multiselect"].includes(f.type) && (f.options?.length ?? 0) > 0);
  const [fieldId, setFieldId] = useState(askable[0]?.id ?? "");
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);

  async function checkStatus(id: string) {
    setFieldId(id); setStatus(null); setAskNote(null);
    if (!id) return;
    const res = await fetch(`/api/admin/request-answers?job_id=${jobId}&field_id=${id}`);
    if (res.ok) setStatus(await res.json());
  }

  async function scan() {
    setScanning(true); setScanNote(null);
    const res = await fetch("/api/admin/scan-resumes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, terms: terms.split(",").map((t) => t.trim()).filter(Boolean), rescan })
    });
    const j = await res.json();
    setScanning(false);
    setScanNote(res.ok ? j.message : (j.error ?? "Could not scan."));
    if (res.ok) setTimeout(() => router.refresh(), 1200);
  }

  async function ask() {
    setAsking(true); setAskNote(null);
    const res = await fetch("/api/admin/request-answers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, field_id: fieldId })
    });
    const j = await res.json();
    setAsking(false);
    setAskNote(res.ok ? j.message : (j.error ?? "Could not send."));
    if (res.ok) { checkStatus(fieldId); setTimeout(() => router.refresh(), 1500); }
  }

  if (!open) {
    return (
      <button className="btn-ghost !h-9 text-xs mb-3" onClick={() => setOpen(true)}>
        ◇ Fill missing answers
      </button>
    );
  }

  return (
    <div className="card p-5 mb-4 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display font-semibold text-lg">Fill missing answers</h3>
          <p className="text-sm text-muted-2 mt-1">
            For a question people skipped — because it wasn&rsquo;t required, or was added after they applied.
          </p>
        </div>
        <button className="text-muted-2 hover:text-ink" onClick={() => setOpen(false)}>✕</button>
      </div>

      {/* 1 · Ask them */}
      <div className="rounded-xl border border-line p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1">
          1 · Ask the applicants
        </div>
        <p className="text-sm text-muted-2 mb-3">
          Each person gets a button per option. One tap writes their answer straight into the
          application — no reply to read, nothing to type in by hand.
        </p>

        {askable.length === 0 ? (
          <p className="text-sm text-muted">
            No question on this form has fixed options. One-click answers need a select or
            multiselect field — a free-text question can&rsquo;t be answered from an email button.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label !text-xs">Question</label>
                <select className="input !h-10 !w-auto text-sm" value={fieldId}
                  onChange={(e) => checkStatus(e.target.value)}>
                  <option value="">Choose a question…</option>
                  {askable.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <button className="btn-coral !h-10 text-sm" onClick={ask}
                disabled={asking || !fieldId || (status && status.missing_answer === 0)}>
                {asking ? "Sending…" : "Ask everyone missing it"}
              </button>
            </div>

            {status && (
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-2">
                <span><strong className="text-ink">{status.missing_answer}</strong> missing an answer</span>
                <span><strong className="text-ink">{status.already_asked}</strong> already asked</span>
                <span><strong className="text-ink">{status.replied}</strong> replied</span>
                <span className={status.remaining_today < 10 ? "text-coral font-semibold" : ""}>
                  {status.remaining_today} email{status.remaining_today === 1 ? "" : "s"} left today
                </span>
              </div>
            )}
            {askNote && <p className="text-sm font-medium text-coral mt-3">{askNote}</p>}
          </>
        )}
      </div>

      {/* 2 · Scan résumés */}
      <div className="rounded-xl border border-line p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1">
          2 · Scan résumés for keywords
        </div>
        <p className="text-sm text-muted-2 mb-3">
          Searches each CV and records what it mentions. Treat this as a hint, not an answer —
          a CV mentioning Ibadan may mean the person studied there years ago. A hit in the contact
          block at the top of the CV is the one worth trusting, and it&rsquo;s flagged as such.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-56">
            <label className="label !text-xs">Keywords, comma separated</label>
            <input className="input !h-10 text-sm" placeholder="Abeokuta, Ibadan"
              value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm h-10">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4"
              checked={rescan} onChange={(e) => setRescan(e.target.checked)} />
            Re-scan already scanned
          </label>
          <button className="btn-ghost !h-10 text-sm" onClick={scan} disabled={scanning || !terms.trim()}>
            {scanning ? "Scanning…" : "Scan résumés"}
          </button>
        </div>
        {scanNote && <p className="text-sm font-medium text-coral mt-3">{scanNote}</p>}
        <p className="text-xs text-muted-2 mt-3">
          Runs 25 at a time. Photographed or scanned CVs have no text to read and are reported separately.
        </p>
      </div>
    </div>
  );
}
