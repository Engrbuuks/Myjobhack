"use client";
import { useState, useEffect } from "react";
import { postJson, callApi } from "@/lib/apiClient";
import { OFFER_TOKENS, DEFAULT_OFFER_BODY, FORMATTING_HELP } from "@/lib/offerLetter";

type Recipient = {
  name: string; email: string;
  position?: string; salary?: string; start_date?: string; reporting_to?: string;
  status?: "pending" | "sent" | "failed";
  error?: string;
};

/**
 * Send offer letters to people who never applied through the site.
 *
 * Referrals, walk ins, someone from a previous round: plenty of hires never
 * touch the form, and an offer system that only works for applicants would
 * send you back to writing letters by hand for exactly the people you were
 * most confident about.
 *
 * Per person columns are optional. Where a row leaves salary or start date
 * blank, the shared values below are used, so a group joining on the same
 * terms is one paste rather than one row of repetition.
 */
export function BulkOffers({ letterheads }: { letterheads: { id: string; name: string; is_default: boolean }[] }) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Recipient[]>([]);
  const [parseNote, setParseNote] = useState<string | null>(null);

  const [letterheadId, setLetterheadId] = useState(
    letterheads.find((l) => l.is_default)?.id ?? letterheads[0]?.id ?? "");
  const [position, setPosition] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [reportingTo, setReportingTo] = useState("");
  const [body, setBody] = useState(DEFAULT_OFFER_BODY);
  const [cc, setCc] = useState("");
  const [startOffset, setStartOffset] = useState(0);

  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [allowance, setAllowance] = useState<any>(null);
  const [stoppedShort, setStoppedShort] = useState(false);

  // Checked before a long batch, not discovered halfway through it.
  useEffect(() => {
    (async () => {
      const r = await callApi("/api/admin/email-applicants");
      if (r.ok) setAllowance(r.data);
    })();
  }, []);

  /**
   * Accept what people actually paste: a CSV, a spreadsheet column pair, or
   * "Name <email>" lines. Rejecting a paste because of its separator would
   * just mean the work happens in a text editor first.
   */
  function parse(text: string) {
    const out: Recipient[] = [];
    const problems: string[] = [];

    text.split(/\r?\n/).forEach((line, i) => {
      const l = line.trim();
      if (!l) return;
      // Skip a header row rather than emailing someone called "Name".
      if (i === 0 && /^\s*(name|full ?name)\b/i.test(l) && /email/i.test(l)) return;

      const angled = l.match(/^(.*?)[<(]\s*([^>)\s]+@[^>)\s]+)\s*[>)]/);
      let parts: string[];
      // Trimmed: "Bola Ade <b@x.com>" otherwise keeps the space before
      // the bracket and the letter opens "Dear Bola Ade ,".
      if (angled) parts = [angled[1].trim(), angled[2].trim()];
      else parts = l.split(/\t|,|;/).map((p) => p.trim());

      const email = parts.find((p) => p.includes("@"))?.replace(/^["']|["']$/g, "") ?? "";
      const name = parts.find((p) => p && !p.includes("@"))?.replace(/^["']|["']$/g, "") ?? "";

      if (!email) { problems.push(`Line ${i + 1}: no email address found`); return; }
      if (!name) { problems.push(`Line ${i + 1}: no name found`); return; }

      const rest = parts.filter((p) => p !== name && p !== email);
      out.push({
        name, email,
        position: rest[0] || undefined,
        salary: rest[1] || undefined,
        start_date: rest[2] || undefined,
        reporting_to: rest[3] || undefined,
        status: "pending"
      });
    });

    // The same address twice means two letters to one person.
    const seen = new Set<string>();
    const deduped = out.filter((r) => {
      const k = r.email.toLowerCase();
      if (seen.has(k)) { problems.push(`${r.email} appears more than once and was included only once`); return false; }
      seen.add(k); return true;
    });

    setRows(deduped);
    setParseNote(problems.length ? problems.join(". ") : null);
  }

  async function preview() {
    if (!rows.length) return;
    setBusy(true); setErr(null);
    try {
      const r = rows[0];
      const res = await postJson("/api/admin/offer", {
        recipient_name: r.name, recipient_email: r.email,
        letterhead_id: letterheadId || null, body,
        position: r.position || position, salary: r.salary || salary,
        start_date: r.start_date || startDate || null,
        reporting_to: r.reporting_to || reportingTo,
        countersign: true, start_offset: startOffset, preview: true
      });
      if (!res.ok) { setErr(res.error); return; }
      const bytes = Uint8Array.from(atob(res.data.pdf_base64), (c) => c.charCodeAt(0));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } finally { setBusy(false); }
  }

  /**
   * Sent one at a time, with each result recorded against its row.
   *
   * A single request for the whole list would mean one failure hiding the
   * rest, and no way to tell who actually received a letter.
   */
  async function sendAll() {
    setBusy(true); setErr(null);
    const ccList = cc.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.includes("@"));

    setStoppedShort(false);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === "sent") continue;
      const res = await postJson("/api/admin/offer", {
        recipient_name: r.name, recipient_email: r.email,
        letterhead_id: letterheadId || null, body,
        position: r.position || position, salary: r.salary || salary,
        start_date: r.start_date || startDate || null,
        reporting_to: r.reporting_to || reportingTo,
        countersign: true, start_offset: startOffset, cc: ccList
      });
      setRows((prev) => prev.map((x, j) => j === i
        ? { ...x, status: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error ?? undefined }
        : x));
      if (res.data?.allowance) setAllowance(res.data.allowance);

      /**
       * Stop the moment the allowance runs out rather than generating
       * failures for everyone remaining. They keep their pending state, so
       * pressing send tomorrow picks up exactly where this left off.
       */
      if (res.status === 429) { setStoppedShort(true); break; }

      await new Promise((s) => setTimeout(s, 400));
    }
    setBusy(false); setDone(true);
  }

  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-semibold text-xl mb-1">Offers to people who did not apply</h2>
        <p className="text-sm text-muted-2">
          Paste a list, or a CSV. Each person receives their own letter on the letterhead, with an
          acceptance link.
        </p>
      </div>

      {err && (
        <div className="card p-4 border-coral/40" style={{ background: "#FFF4F2" }}>
          <p className="text-sm text-ink">{err}</p>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <label className="label !text-xs">The people</label>
          <textarea className="input !h-auto py-2 font-mono text-xs" rows={7} value={raw}
            onChange={(e) => { setRaw(e.target.value); parse(e.target.value); }}
            placeholder={"Ada Okafor, ada@example.com\nBola Ade <bola@example.com>\nChidi Eze, chidi@example.com, Call Center Agent, NGN 90000, 2026-09-15, Rita Adewale"} />
          <p className="text-xs text-muted-2 mt-1.5">
            Name and email are all that is required. You can add position, salary, start date and
            reporting line per person after the email, and anything left out uses the shared
            values below.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <label className="btn-ghost !h-9 text-xs cursor-pointer">
              Upload a CSV
              <input type="file" accept=".csv,.txt" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const text = await f.text(); setRaw(text); parse(text);
                }} />
            </label>
          </div>
        </div>

        {parseNote && (
          <div className="rounded-xl border border-coral/40 p-3" style={{ background: "#FFF4F2" }}>
            <p className="text-sm text-ink">{parseNote}</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-xl border border-line max-h-56 overflow-y-auto divide-y divide-line">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 text-sm">
                <span className="flex-1 min-w-0 truncate">{r.name}</span>
                <span className="text-muted-2 text-xs truncate">{r.email}</span>
                {r.status === "sent" && <span className="text-xs text-coral font-semibold shrink-0">sent</span>}
                {r.status === "failed" && (
                  <span className="text-xs text-coral shrink-0" title={r.error}>failed</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted">
          Shared terms, used where a row leaves them blank
        </div>
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
            <input className="input !h-10" value={reportingTo}
              onChange={(e) => { setReportingTo(e.target.value); setPdfUrl(null); }} />
          </div>
          <div className="sm:col-span-2">
            <label className="label !text-xs">Copy anyone in, separated by commas</label>
            <input className="input !h-10" value={cc} placeholder="associate@myjobhack.co"
              onChange={(e) => setCc(e.target.value)} />
            <p className="text-xs text-muted-2 mt-1">
              They receive every letter and attachment, including each person&rsquo;s salary.
            </p>
          </div>
        </div>

        <div>
          <label className="label !text-xs">Letter</label>
          <textarea className="input !h-auto py-2" rows={9} value={body}
            onChange={(e) => { setBody(e.target.value); setPdfUrl(null); }} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {OFFER_TOKENS.map((t) => (
              <button key={t} onClick={() => { setBody((v) => v + t); setPdfUrl(null); }}
                className="rounded-pill border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-coral hover:text-coral transition">
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-2 mt-2">{FORMATTING_HELP}</p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span className="text-xs text-muted">Where the letter starts</span>
            <button className="btn-ghost !h-8 text-xs"
              onClick={() => { setStartOffset((v) => Math.max(-80, v - 20)); setPdfUrl(null); }}>Higher</button>
            <span className="text-xs text-muted-2 w-20 text-center">
              {startOffset === 0 ? "default" : `${startOffset > 0 ? "+" : ""}${startOffset}pt`}
            </span>
            <button className="btn-ghost !h-8 text-xs"
              onClick={() => { setStartOffset((v) => Math.min(200, v + 20)); setPdfUrl(null); }}>Lower</button>
          </div>
        </div>
      </div>

      {pdfUrl && (
        <div className="card p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
            {rows[0]?.name}&rsquo;s letter, as it will arrive
          </div>
          <object data={pdfUrl} type="application/pdf" className="w-full rounded-xl border border-line"
            style={{ height: "60vh" }}>
            <p className="p-4 text-sm text-muted">
              <a href={pdfUrl} download="offer-preview.pdf" className="text-coral font-medium">
                Download the preview
              </a>
            </p>
          </object>
        </div>
      )}

      {allowance && rows.length > 0 && (
        <div className={`card p-4 ${rows.length > allowance.remaining ? "border-coral/40" : ""}`}
          style={rows.length > allowance.remaining ? { background: "#FFF4F2" } : undefined}>
          <p className="text-sm">
            <strong className="text-ink">{allowance.remaining}</strong>
            <span className="text-muted-2"> of {allowance.cap} emails left today, and you are sending {rows.length}.</span>
          </p>
          {rows.length > allowance.remaining && (
            <p className="text-xs text-coral font-medium mt-1">
              The first {allowance.remaining} will go. The rest keep their place and are sent when
              you run this again, so nobody is missed and nobody receives two.
            </p>
          )}
          <p className="text-xs text-muted-2 mt-1">
            Offer letters count against the same daily limit as every other email the platform
            sends.
          </p>
        </div>
      )}

      {done && (
        <div className="card p-4" style={{ background: "#FFF4F2" }}>
          <p className="font-semibold text-sm text-ink">
            {sent} of {rows.length} sent.
            {stoppedShort && " Stopped because today's allowance ran out."}
          </p>
          {failed.length > 0 && (
            <div className="mt-2">
              {failed.map((f, i) => (
                <p key={i} className="text-xs text-muted">
                  <strong className="text-ink">{f.name}</strong>: {f.error}
                </p>
              ))}
              <p className="text-xs text-muted-2 mt-2">
                Fix these and press send again. Anyone already sent is skipped, so nobody receives
                two letters.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!pdfUrl ? (
          <button className="btn-coral" onClick={preview} disabled={busy || !rows.length}>
            {busy ? "Building…" : `Preview ${rows[0]?.name ?? "the first"}'s letter`}
          </button>
        ) : (
          <>
            <button className="btn-coral" onClick={sendAll} disabled={busy}>
              {busy ? `Sending, ${sent} of ${rows.length}…` : `Send ${rows.length} offer${rows.length === 1 ? "" : "s"}`}
            </button>
            <button className="btn-ghost" onClick={preview} disabled={busy}>Rebuild preview</button>
          </>
        )}
      </div>
    </div>
  );
}
