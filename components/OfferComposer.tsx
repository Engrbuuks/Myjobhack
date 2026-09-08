"use client";
import { useState, useEffect } from "react";
import { callApi, postJson } from "@/lib/apiClient";
import { OFFER_TOKENS, DEFAULT_OFFER_BODY } from "@/lib/offerLetter";

/**
 * Compose and issue an offer letter.
 *
 * The preview renders the ACTUAL PDF, not a text approximation. An offer
 * letter states someone's salary and start date on company paper: a preview
 * that does not show the real document would not catch text landing on the
 * logo, a missing signature, or a token that failed to fill.
 */
export function OfferComposer({ applicationId, candidateName, jobTitle, onDone }: {
  applicationId: string; candidateName: string; jobTitle: string; onDone?: () => void;
}) {
  const [letterheads, setLetterheads] = useState<any[]>([]);
  const [letterheadId, setLetterheadId] = useState("");
  const [position, setPosition] = useState(jobTitle);
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [reportingTo, setReportingTo] = useState("");
  const [body, setBody] = useState(DEFAULT_OFFER_BODY);
  const [cc, setCc] = useState("");
  const [countersign, setCountersign] = useState(true);

  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await callApi("/api/admin/letterheads");
      if (r.ok) {
        const list = r.data?.letterheads ?? [];
        setLetterheads(list);
        setLetterheadId(list.find((l: any) => l.is_default)?.id ?? list[0]?.id ?? "");
      }
    })();
  }, []);

  const payload = () => ({
    application_id: applicationId, letterhead_id: letterheadId || null,
    body, position, salary, start_date: startDate || null,
    reporting_to: reportingTo, countersign,
    cc: cc.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.includes("@"))
  });

  async function preview() {
    setBusy(true); setErr(null);
    try {
      const r = await postJson("/api/admin/offer", { ...payload(), preview: true });
      if (!r.ok) { setErr(r.error); return; }
      // Rendered in an object tag so you read the real document, not a summary.
      const bytes = Uint8Array.from(atob(r.data.pdf_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setWarnings(r.data.warnings ?? []);
    } finally { setBusy(false); }
  }

  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await postJson("/api/admin/offer", payload());
      if (r.ok) { setSent(r.data?.message ?? "Sent."); setTimeout(() => onDone?.(), 2000); }
      else setErr(r.error);
    } finally { setBusy(false); }
  }

  if (sent) return (
    <div className="card p-5">
      <div className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mb-3">✓</div>
      <p className="font-semibold">{sent}</p>
    </div>
  );

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold text-lg">Offer letter for {candidateName}</h3>
        <p className="text-sm text-muted-2 mt-1">
          Preview the actual document before it goes. It is attached to their email as a PDF and
          they accept online or by signing and returning it.
        </p>
      </div>

      {err && (
        <div className="rounded-xl border border-coral/40 p-3" style={{ background: "#FFF4F2" }}>
          <p className="text-sm text-ink">{err}</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label !text-xs">Letterhead</label>
          <select className="input !h-10 text-sm" value={letterheadId}
            onChange={(e) => { setLetterheadId(e.target.value); setPdfUrl(null); }}>
            {letterheads.length === 0 && <option value="">None set up, plain paper</option>}
            {letterheads.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.is_default ? " (default)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label !text-xs">Position</label>
          <input className="input !h-10" value={position}
            onChange={(e) => { setPosition(e.target.value); setPdfUrl(null); }} />
        </div>
        <div>
          <label className="label !text-xs">Remuneration</label>
          <input className="input !h-10" value={salary} placeholder="NGN 90,000 per month"
            onChange={(e) => { setSalary(e.target.value); setPdfUrl(null); }} />
        </div>
        <div>
          <label className="label !text-xs">Start date</label>
          <input className="input !h-10" type="date" value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPdfUrl(null); }} />
        </div>
        <div className="sm:col-span-2">
          <label className="label !text-xs">Reporting to</label>
          <input className="input !h-10" value={reportingTo} placeholder="Rita Adewale, Operations Lead"
            onChange={(e) => { setReportingTo(e.target.value); setPdfUrl(null); }} />
        </div>
      </div>

      <div>
        <label className="label !text-xs">Letter</label>
        <textarea className="input !h-auto py-2" rows={10} value={body}
          onChange={(e) => { setBody(e.target.value); setPdfUrl(null); }} />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {OFFER_TOKENS.map((t) => (
            <button key={t} onClick={() => { setBody((v) => v + t); setPdfUrl(null); }}
              className="rounded-pill border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-coral hover:text-coral transition">
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label !text-xs">Copy anyone in, separated by commas</label>
          <input className="input !h-10" value={cc} placeholder="hr@eppme.com, manager@eppme.com"
            onChange={(e) => setCc(e.target.value)} />
          <p className="text-xs text-muted-2 mt-1">
            They receive the same letter and attachment. Up to five.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm pt-6">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4 mt-0.5" checked={countersign}
            onChange={(e) => { setCountersign(e.target.checked); setPdfUrl(null); }} />
          <span>
            Include the acceptance block
            <span className="block text-xs text-muted-2 mt-0.5">
              A signature and date line for the candidate to sign and return.
            </span>
          </span>
        </label>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-coral/40 p-3" style={{ background: "#FFF4F2" }}>
          {warnings.map((w, i) => <p key={i} className="text-sm text-ink mb-1 last:mb-0">{w}</p>)}
        </div>
      )}

      {pdfUrl && (
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
            The document as it will arrive
          </div>
          <object data={pdfUrl} type="application/pdf" className="w-full rounded-xl border border-line"
            style={{ height: "60vh" }}>
            <p className="p-4 text-sm text-muted">
              Your browser will not display the PDF here.{" "}
              <a href={pdfUrl} download="offer-preview.pdf" className="text-coral font-medium">
                Download it instead
              </a>.
            </p>
          </object>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!pdfUrl ? (
          <button className="btn-coral" onClick={preview} disabled={busy || !body.trim()}>
            {busy ? "Building the letter…" : "Preview the letter"}
          </button>
        ) : (
          <>
            <button className="btn-coral" onClick={send} disabled={busy}>
              {busy ? "Sending…" : "Send this offer"}
            </button>
            <button className="btn-ghost" onClick={preview} disabled={busy}>Rebuild preview</button>
          </>
        )}
        {onDone && <button className="btn-ghost" onClick={onDone} disabled={busy}>Close</button>}
      </div>
    </div>
  );
}
