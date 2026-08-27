/**
 * Scan a résumé for keywords — location, tools, certifications, anything.
 *
 * WHAT THIS IS FOR: filling triage gaps when a question was optional and
 * people skipped it. It tells you what the CV mentions. It does NOT tell you
 * what the candidate would have answered.
 *
 * The distinction matters most for location, which is the usual reason to
 * reach for this. "University of Ibadan" on a CV says where somebody studied,
 * possibly a decade ago. A Lagos-based accountant may mention Ibadan, Abeokuta
 * and Kano across a career history without living in any of them. The one
 * genuinely useful signal is a mention in the contact block at the top, which
 * is normally a current address — so we record WHERE the hit was, not just
 * that there was one.
 */

/**
 * How much of the start of a CV counts as the contact/header block.
 *
 * A flat 500 characters breaks on short CVs: a one-page graduate CV can be
 * under 500 characters of extracted text, so the ENTIRE document would count
 * as the header and every mention anywhere would look like a current address.
 * Scale it for short documents, with a floor that still covers a name,
 * address and phone line.
 */
const HEADER_CHARS_MAX = 500;
const HEADER_CHARS_MIN = 120;

function headerLength(len: number): number {
  return Math.min(HEADER_CHARS_MAX, Math.max(HEADER_CHARS_MIN, Math.floor(len * 0.25)));
}

export type KeywordHit = {
  term: string;
  count: number;
  /** Appeared in the contact block — far more likely to be a current address. */
  in_header: boolean;
  /** Surrounding text of the first hit, so a human can judge it quickly. */
  context: string | null;
};

export type ResumeSignals = {
  hits: KeywordHit[];
  /** Best guess: a header hit wins, otherwise the most frequent term. */
  top: string | null;
  /** True when two or more terms appear — the guess is unreliable. */
  ambiguous: boolean;
  scanned_chars: number;
};

/**
 * Match whole words only, case-insensitively.
 *
 * Substring matching produces nonsense on Nigerian place names — "Ondo" hits
 * inside "London", "Oyo" inside "Bayo". A word-boundary match avoids the whole
 * class of error.
 */
function countTerm(text: string, term: string): { count: number; firstIndex: number } {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return { count: 0, firstIndex: -1 };
  const re = new RegExp(`\\b${escaped.replace(/\s+/g, "\\s+")}\\b`, "gi");
  let count = 0, firstIndex = -1, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (firstIndex === -1) firstIndex = m.index;
    count++;
    if (count > 500) break;               // pathological input guard
  }
  return { count, firstIndex };
}

export function scanText(text: string, terms: string[]): ResumeSignals {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const header = clean.slice(0, headerLength(clean.length));

  const hits: KeywordHit[] = [];
  for (const term of terms.map((t) => t.trim()).filter(Boolean)) {
    const { count, firstIndex } = countTerm(clean, term);
    if (!count) continue;
    const inHeader = countTerm(header, term).count > 0;
    const context = firstIndex >= 0
      ? clean.slice(Math.max(0, firstIndex - 60), firstIndex + term.length + 60).trim()
      : null;
    hits.push({ term, count, in_header: inHeader, context });
  }

  // A hit in the contact block beats raw frequency: a career history can
  // mention three cities, but the address at the top is usually the current one.
  hits.sort((a, b) =>
    (b.in_header ? 1 : 0) - (a.in_header ? 1 : 0) || b.count - a.count
  );

  const headerHits = hits.filter((h) => h.in_header);
  const ambiguous = headerHits.length > 1 || (headerHits.length === 0 && hits.length > 1);

  return {
    hits,
    top: hits[0]?.term ?? null,
    ambiguous,
    scanned_chars: clean.length
  };
}

/** One-line summary for the applicant table. */
export function describeSignals(s: ResumeSignals | null | undefined): string {
  if (!s || !s.hits?.length) return "";
  const parts = s.hits.map((h) => `${h.term}${h.count > 1 ? ` ×${h.count}` : ""}${h.in_header ? " (top of CV)" : ""}`);
  return s.ambiguous ? `${parts.join(", ")} — unclear` : parts.join(", ");
}

/** A short, URL-safe token for one-click answer links. */
export function makeToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}
