"use client";
import { useState } from "react";
import { ExportButton } from "@/components/ExportButton";

/**
 * What the résumé scan actually found, across the whole job.
 *
 * The most useful number here is not the hit count — it is the AGREEMENT rate.
 * Some applicants answered the question AND have a scannable CV, which means
 * we can check the scan's guess against a known answer and measure how often
 * it is right. That tells you whether to trust the guess for the people who
 * never answered, instead of assuming it.
 */

type Signals = {
  hits?: { term: string; count: number; in_header: boolean; context?: string | null }[];
  top?: string | null;
  ambiguous?: boolean;
  unreadable?: boolean;
  terms?: string[];
} | null;

export type ScanRow = {
  id: string;
  name: string;
  signals: Signals;
  scanned: boolean;
  hasResume: boolean;
  /** What they actually said, if they answered the matching question. */
  declared: string | null;
  /** Redaction-aware CV endpoint, so the report can be checked against the source. */
  resumeUrl?: string | null;
};

export function ResumeScanReport({ rows, questionLabel }: {
  rows: ScanRow[];
  /** The form question whose options match the scan terms, if any. */
  questionLabel: string | null;
}) {
  const [open, setOpen] = useState(false);

  const scanned = rows.filter((r) => r.scanned);
  if (scanned.length === 0) return null;

  const unreadable = scanned.filter((r) => r.signals?.unreadable);
  const noResume = rows.filter((r) => !r.hasResume);
  const readable = scanned.filter((r) => !r.signals?.unreadable);
  const withHits = readable.filter((r) => (r.signals?.hits?.length ?? 0) > 0);
  const noMention = readable.filter((r) => (r.signals?.hits?.length ?? 0) === 0);
  const ambiguous = withHits.filter((r) => r.signals?.ambiguous);
  const pending = rows.filter((r) => !r.scanned).length;

  // Per term: how many CVs mention it, and how many mention it up top.
  const terms = Array.from(new Set(
    scanned.flatMap((r) => r.signals?.terms ?? r.signals?.hits?.map((h) => h.term) ?? [])
  ));
  const perTerm = terms.map((term) => {
    const mentions = readable.filter((r) => r.signals?.hits?.some((h) => h.term === term));
    const inHeader = mentions.filter((r) => r.signals?.hits?.some((h) => h.term === term && h.in_header));
    return {
      term,
      mentions: mentions.length,
      in_header: inHeader.length,
      body_only: mentions.length - inHeader.length,
      is_top: readable.filter((r) => r.signals?.top === term).length
    };
  }).sort((a, b) => b.mentions - a.mentions);

  // Accuracy: only people who BOTH answered and produced a scan guess.
  const checkable = readable.filter((r) => r.declared && r.signals?.top);
  const agreed = checkable.filter(
    (r) => r.signals!.top!.toLowerCase() === r.declared!.toLowerCase());
  const headerCheckable = checkable.filter(
    (r) => r.signals?.hits?.some((h) => h.term === r.signals?.top && h.in_header));
  const headerAgreed = headerCheckable.filter(
    (r) => r.signals!.top!.toLowerCase() === r.declared!.toLowerCase());

  const pct = (n: number, d: number) => d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;

  // The people this whole exercise is for: no answer, but a scan guess.
  const gapsFilled = readable.filter((r) => !r.declared && r.signals?.top && !r.signals?.ambiguous);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const exportRows = scanned.map((r) => ({
    name: r.name,
    cv_link: r.resumeUrl ? `${origin}${r.resumeUrl}` : "",
    declared_answer: r.declared ?? "",
    resume_guess: r.signals?.top ?? "",
    confidence: r.signals?.unreadable ? "unreadable"
      : !r.signals?.top ? "no mention"
      : r.signals?.ambiguous ? "unclear — several terms"
      : r.signals?.hits?.some((h) => h.term === r.signals?.top && h.in_header) ? "strong — top of CV"
      : "weak — body of CV",
    agrees_with_answer: r.declared && r.signals?.top
      ? (r.signals.top.toLowerCase() === r.declared.toLowerCase() ? "yes" : "no") : "",
    all_mentions: (r.signals?.hits ?? [])
      .map((h) => `${h.term}${h.count > 1 ? ` x${h.count}` : ""}${h.in_header ? " (top)" : ""}`).join("; ")
  }));

  return (
    <div className="card p-5 mb-4">
      <button className="w-full flex items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <div>
          <h3 className="font-display font-semibold text-lg">Résumé scan report</h3>
          <p className="text-sm text-muted-2 mt-0.5">
            {scanned.length} scanned · {withHits.length} mentioned a keyword
            {gapsFilled.length > 0 && ` · ${gapsFilled.length} gap${gapsFilled.length === 1 ? "" : "s"} with a clear guess`}
            {pending > 0 && ` · ${pending} not scanned yet`}
          </p>
        </div>
        <span className="text-muted-2 text-sm shrink-0 ml-4">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-5 space-y-5">
          {/* Coverage — what could and could not be read */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat n={withHits.length} label="Mentioned a keyword" />
            <Stat n={noMention.length} label="No mention found" />
            <Stat n={unreadable.length} label="Couldn't be read" tone={unreadable.length ? "warn" : undefined} />
            <Stat n={noResume.length} label="No résumé on file" tone={noResume.length ? "warn" : undefined} />
          </div>

          {(unreadable.length > 0 || noResume.length > 0) && (
            <p className="text-xs text-muted-2">
              {unreadable.length > 0 && `${unreadable.length} CV${unreadable.length === 1 ? " was" : "s were"} photographed or scanned, so there is no text to search. `}
              Scanning can never reach {unreadable.length + noResume.length} of these applicants — ask them directly instead.
            </p>
          )}

          {/* Per keyword */}
          {perTerm.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">By keyword</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-2 border-b border-line">
                      <th className="py-2 pr-4 font-semibold">Keyword</th>
                      <th className="py-2 pr-4 font-semibold">CVs mentioning it</th>
                      <th className="py-2 pr-4 font-semibold">At top of CV</th>
                      <th className="py-2 pr-4 font-semibold">Body only</th>
                      <th className="py-2 font-semibold">Best guess for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perTerm.map((t) => (
                      <tr key={t.term} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 font-semibold">{t.term}</td>
                        <td className="py-2 pr-4">{t.mentions}</td>
                        <td className="py-2 pr-4 text-ink font-medium">{t.in_header}</td>
                        <td className="py-2 pr-4 text-muted-2">{t.body_only}</td>
                        <td className="py-2">{t.is_top}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-2 mt-2">
                &ldquo;At top of CV&rdquo; means the term appears in the contact block — usually a current
                address. &ldquo;Body only&rdquo; is normally an old employer or a university.
              </p>
            </div>
          )}

          {/* Accuracy against declared answers */}
          <div className="rounded-xl bg-paper-2 border border-line p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
              How often is the scan right?
            </div>
            {checkable.length === 0 ? (
              <p className="text-sm text-muted-2">
                {questionLabel
                  ? `Nobody both answered "${questionLabel}" and produced a scan result, so there's no way to check the scan's accuracy on this job. Treat every guess as unverified.`
                  : "No question on this form has options matching your keywords, so the scan can't be checked against real answers. Treat every guess as unverified."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <div className="numeral !text-3xl">{pct(agreed.length, checkable.length)}</div>
                    <div className="text-xs text-muted-2 mt-1">
                      of {checkable.length} who answered<br />matched the scan&rsquo;s guess
                    </div>
                  </div>
                  {headerCheckable.length > 0 && (
                    <div>
                      <div className="numeral !text-3xl">{pct(headerAgreed.length, headerCheckable.length)}</div>
                      <div className="text-xs text-muted-2 mt-1">
                        of {headerCheckable.length} where the hit<br />was at the top of the CV
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-2 mt-3">
                  This is measured against people who actually answered. If the second number is high
                  and the first is low, trust only the &ldquo;top of CV&rdquo; hits and ask everyone else.
                  {checkable.length < 10 && " With fewer than ten to check against, treat this as a rough indication only."}
                </p>
              </>
            )}
          </div>

          {/* Gaps this closed */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm">
              <strong className="text-ink">{gapsFilled.length}</strong>
              <span className="text-muted-2"> applicant{gapsFilled.length === 1 ? "" : "s"} had no answer but a single clear keyword</span>
            </div>
            {ambiguous.length > 0 && (
              <div className="text-sm text-muted-2">
                {ambiguous.length} mentioned several keywords — no guess made
              </div>
            )}
            <div className="flex-1" />
            <ExportButton rows={exportRows} filename="resume-scan-report" label="Export scan report" />
          </div>

          <p className="text-xs text-muted-2 border-t border-line pt-3">
            None of this is written into anyone&rsquo;s answers. It is a triage aid — filter on
            &ldquo;Résumé mentions&rdquo; to work through it, and confirm before you act on a guess.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" && n > 0 ? "border-coral/40 bg-coral-soft" : "border-line bg-white"}`}>
      <div className="font-display font-semibold text-2xl leading-none">{n}</div>
      <div className="text-xs text-muted-2 mt-1.5">{label}</div>
    </div>
  );
}
