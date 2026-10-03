/**
 * Read a list of offer recipients from a CSV, a spreadsheet paste, or plain
 * "Name <email>" lines.
 *
 * WHAT WENT WRONG BEFORE: each line was split on every comma. A salary
 * written the way spreadsheets export it, "NGN 90,000", arrived in quotes
 * precisely because it contains a comma, and splitting through the quotes cut
 * it in two. The tail, 000", then slid into the start date column and the
 * database rejected it: date/time field value out of range. Columns were also
 * taken by position, so any extra column such as Phone shifted everything
 * after it.
 *
 * Now: quotes are honoured the way every spreadsheet writes them, columns are
 * matched by their header names when there is a header, and dates are read
 * in the formats people actually use, with anything unreadable reported
 * rather than sent to the database.
 */

export type ParsedRecipient = {
  name: string;
  email: string;
  position?: string;
  salary?: string;
  /** ISO yyyy-mm-dd, only ever set when the date was read with certainty. */
  start_date?: string;
  reporting_to?: string;
};

export type ParseResult = {
  rows: ParsedRecipient[];
  problems: string[];
  /** Plain account of what was understood, shown before anything is sent. */
  notes: string[];
};

/* ------------------------------------------------------------------ *
 * CSV records, honouring quotes
 * ------------------------------------------------------------------ */

/** Pick the separator from the first line, ignoring anything inside quotes. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const outside = firstLine.replace(/"[^"]*"/g, "");
  if (outside.includes("\t")) return "\t";
  const commas = (outside.match(/,/g) ?? []).length;
  const semis = (outside.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/**
 * Split text into records and fields. Quoted fields may contain the
 * separator, line breaks, and doubled quotes ("") standing for one quote,
 * which is exactly how Excel and Google Sheets export them.
 */
export function readRecords(text: string, delimiter = detectDelimiter(text)): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");   // Excel's byte order mark

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field.trim() === "") { inQuotes = true; field = ""; continue; }
    if (c === delimiter) { record.push(field.trim()); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field.trim()); field = "";
      if (record.some((f) => f !== "")) records.push(record);
      record = [];
      continue;
    }
    field += c;
  }
  record.push(field.trim());
  if (record.some((f) => f !== "")) records.push(record);
  return records;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

/** "Sept", "September" and "sep" all mean 9; anything else is not a month. */
function monthOf(word: string): number | undefined {
  const w = word.toLowerCase();
  return MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)];
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects impossible dates such as 31/02 rather than rolling them over.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Read a start date, returning ISO or null.
 *
 * Numeric dates are read day first, the Nigerian convention: 05/09/2026 is
 * 5 September. Where the second number cannot be a month (09/15/2026) it is
 * clearly month first and read that way. The date as understood is shown
 * back before sending, so an ambiguous one can be checked by eye.
 */
export function readDate(raw: string | undefined | null): string | null {
  const v0 = String(raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!v0) return null;

  // Spreadsheets and databases often export a date with the midnight it was
  // stored at: 15/09/2026 00:00, or 2026-09-15T00:00:00.000Z. A weekday may
  // also be written in front of it. None of that changes which day is meant,
  // so it is removed before the date itself is read. Without this the whole
  // value failed to parse and the column was silently ignored.
  const v = v0
    .replace(/^(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i, "")
    .replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm)?\s*(z|utc|gmt|wat|[+-]\d{2}(:?\d{2})?)?$/i, "")
    .replace(/\s+(z|utc|gmt|wat)$/i, "")
    .trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);            // 2026-09-15
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);               // 15/09/2026
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (b > 12 && a <= 12) return iso(y, a, b);                          // US order
    return iso(y, b, a);                                                  // day first
  }

  m = v.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]+([a-z]+)\.?[\s\-/.,]+(\d{2,4})$/i);  // 15 September 2026
  if (m) {
    const mo = monthOf(m[2]);
    if (mo) return iso(+m[3], mo, +m[1]);
  }

  m = v.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i);             // September 15, 2026
  if (m) {
    const mo = monthOf(m[1]);
    if (mo) return iso(+m[3], mo, +m[2]);
  }

  // Excel sometimes exports a date as its serial number: 46280.
  if (/^\d{5}$/.test(v)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

/** "2026-09-15" as "15 September 2026", for showing back what was read. */
export function showDate(isoDate?: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  });
}

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */

type Field = keyof ParsedRecipient | "first_name" | "last_name";

/** Header wordings people actually use, matched loosely. */
const HEADERS: [Field, RegExp][] = [
  ["email", /^e[\s_-]?mail(\s*address)?$|^email\b/i],
  ["first_name", /^(first|given)[\s_-]*name$/i],
  ["last_name", /^(last|sur|family)[\s_-]*name$|^surname$/i],
  ["name", /^(full[\s_-]*)?name$|^candidate(\s*name)?$|^employee(\s*name)?$|^names?$/i],
  ["position", /^(position|role|job(\s*title)?|title|designation)$/i],
  ["salary", /^(salary|pay|remuneration|compensation|wage|monthly\s*salary|amount)$/i],
  ["start_date", /^(start(\s*date)?|resumption(\s*date)?|resume(\s*date)?|date(\s*of)?\s*(start|resumption)|start\s*on)$/i],
  ["reporting_to", /^(reporting(\s*to)?|reports?\s*to|manager|supervisor|line\s*manager)$/i]
];

/**
 * Reduce a header to its words: no punctuation, no underscores, and no
 * format hint in brackets. "Start_Date", "START DATE*" and
 * "Start Date (DD/MM/YYYY)" are all the same column.
 */
function normaliseHeader(cell: string): string {
  return cell
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[*:#"']+/g, " ")
    .replace(/[_\-–./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Words that say nothing about which column this is. */
const FILLER = /\b(of|the|to|on|at|in|for|a|an|and|proposed|expected|anticipated|agreed|intended|tentative|planned|preferred|confirmed|actual|employee|employees|candidate|candidates|staff|new|first|work|working|job|duty|duties|office|employment|please|yyyy|mm|dd)\b/g;

const STARTISH = /^(start|starts|started|starting|resumption|resume|resumes|resuming|commence|commences|commencement|commencing|joining|join|joins|joined|onboard|onboarding|induction|effective|effectivity|resumed)$/;

/**
 * Does this header name a start date?
 *
 * WHY THIS IS NOT A FIXED LIST: every company words it differently —
 * Resumption Date, Commencement Date, Date Joined, Effective Date, Expected
 * Resumption, start_date. A fixed list meant anything outside it was dropped
 * without a word, and the shared date was used for everyone instead.
 *
 * A header qualifies when it says "date" together with a starting word, when
 * it is a starting word on its own ("Resumption"), or when it is simply
 * "Date". "Starting Salary" and "Date of Birth" are deliberately excluded:
 * one has a starting word but no date, the other a date but no starting word.
 */
function isStartDateHeader(h: string): boolean {
  const words = h.replace(FILLER, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const isDate = (w: string) => /^(dates?|days?)$/.test(w);
  const hasDate = words.some(isDate);
  const hasStart = words.some((w) => STARTISH.test(w));
  if (hasDate && words.every((w) => isDate(w))) return true;          // "Date"
  if (hasDate && hasStart) return true;                                // "Date Joined"
  if (hasStart && words.every((w) => STARTISH.test(w) || isDate(w))) return true;  // "Resumption"
  return false;
}

function headerField(cell: string): Field | null {
  const c = normaliseHeader(cell);
  if (!c) return null;
  for (const [f, re] of HEADERS) if (re.test(c)) return f;
  if (isStartDateHeader(c)) return "start_date";
  return null;
}

const clean = (v: string | undefined) => {
  const t = String(v ?? "").trim().replace(/^["']|["']$/g, "").trim();
  return t || undefined;
};

/* ------------------------------------------------------------------ *
 * Recognising values by what they are
 * ------------------------------------------------------------------ */

/** Honorifics that mark a cell as a person, such as a supervisor. */
const TITLE = /^(mr|mrs|ms|miss|mx|dr|engr|eng|prof|chief|alhaji|alhaja|pastor|rev|barr|hon|sir|madam|mdm)\.?\s+\S/i;

/** Money: a currency marker, a pay period, or a large number. */
function looksLikeMoney(v: string): boolean {
  if (/(₦|\bngn\b|\bnaira\b|\$|\busd\b|£|\bgbp\b|€|\beur\b|\bghs\b|\bkes\b)/i.test(v)) return true;
  if (/\b(per\s*(month|annum|year|week|day|hour)|monthly|annually|p\.?\s?a\.?|p\/?m)\b/i.test(v)) return true;
  if (/^n\s?\d/i.test(v)) return true;                           // N90,000
  if (/^\d{1,3}(,\d{3})+(\.\d+)?\s*k?$/i.test(v)) return true;  // 90,000
  if (/^\d+(\.\d+)?\s*k$/i.test(v)) return true;                // 90k
  // A bare number is money here, never an Excel date serial: without a
  // header there is no way to know it is a date, and 45000 is far more
  // likely to be a salary than 16 March 2023.
  if (/^\d{4,}(\.\d+)?$/.test(v)) return true;
  return false;
}

/**
 * Sort the optional cells of a headerless row into their fields.
 *
 * WHY: taking them by position meant any row that skipped a column or put
 * them in a different order had everything after the gap in the wrong field.
 * A list with a supervisor's name where the start date was expected had
 * "Ms. Bello Aishah" read as a date, and the reporting line lost. Each value
 * is recognised by what it is instead. Plain text with nothing to mark it is
 * the only case left to order: the first is the position, the next the
 * reporting line.
 */
export function classify(cells: string[]): {
  position?: string; salary?: string; start_date?: string; reporting_to?: string;
} {
  const out: { position?: string; salary?: string; start_date?: string; reporting_to?: string } = {};
  const plain: string[] = [];
  for (const raw of cells) {
    const v = raw.trim();
    if (!v) continue;
    if (!out.salary && looksLikeMoney(v)) { out.salary = v; continue; }
    if (!out.start_date && !/^\d+$/.test(v)) {
      const d = readDate(v);
      if (d) { out.start_date = d; continue; }
    }
    if (!out.reporting_to && TITLE.test(v)) { out.reporting_to = v; continue; }
    plain.push(v);
  }
  if (plain.length) out.position = plain.shift();
  if (!out.reporting_to && plain.length) out.reporting_to = plain.shift();
  return out;
}

/* ------------------------------------------------------------------ *
 * The parser
 * ------------------------------------------------------------------ */

export function parseRecipients(text: string): ParseResult {
  const problems: string[] = [];
  const notes: string[] = [];
  const out: ParsedRecipient[] = [];

  if (!text.trim()) return { rows: [], problems, notes };

  const records = readRecords(text);
  if (!records.length) return { rows: [], problems, notes };

  // A header row is one with a recognisable email column and no address in it.
  const first = records[0];
  const firstMap = first.map(headerField);
  const hasHeader = !first.some((c) => c.includes("@")) && firstMap.includes("email");

  let columns: (Field | null)[] = [];
  if (hasHeader) {
    columns = firstMap;
    const used = first.filter((_, i) => columns[i]).map((c) => c.trim());
    const ignored = first.filter((c, i) => !columns[i] && c.trim()).map((c) => c.trim());
    notes.push(`Read by column name: ${used.join(", ")}.`);
    if (ignored.length) notes.push(`Not used: ${ignored.join(", ")}.`);
    // Said plainly, because the previous behaviour was to use the shared date
    // for everyone without explaining that the file's own column was missed.
    if (!columns.includes("start_date"))
      notes.push("No start date column was recognised, so the shared start date below applies to everyone. Name the column Start Date, Resumption Date or Commencement Date to use dates from the file.");
  }

  const body = hasHeader ? records.slice(1) : records;

  body.forEach((rec, k) => {
    const lineNo = k + (hasHeader ? 2 : 1);
    let r: ParsedRecipient & { first_name?: string; last_name?: string } = { name: "", email: "" };
    let rawDate: string | undefined;

    if (hasHeader) {
      rec.forEach((cell, i) => {
        const f = columns[i];
        if (!f) return;
        if (f === "start_date") rawDate = clean(cell);
        else (r as any)[f] = clean(cell);
      });
      if (!r.name && (r.first_name || r.last_name))
        r.name = [r.first_name, r.last_name].filter(Boolean).join(" ");
    } else {
      // No header: a single "Name <email>" cell, or name and email then the
      // optional columns in the order the form describes.
      const joined = rec.join(" ").trim();
      const angled = rec.length === 1 && joined.match(/^(.*?)[<(]\s*([^>)\s]+@[^>)\s]+)\s*[>)]\s*$/);
      if (angled) {
        r.name = angled[1].trim();
        r.email = angled[2].trim();
      } else {
        const cells = rec.map((c) => clean(c) ?? "");
        const ei = cells.findIndex((c) => c.includes("@"));
        r.email = ei >= 0 ? cells[ei] : "";
        const others = cells.filter((_, i) => i !== ei);
        const ni = others.findIndex((c) => c !== "");
        r.name = ni >= 0 ? others[ni] : "";
        const c = classify(others.slice(ni + 1));
        r.position = c.position;
        r.salary = c.salary;
        r.start_date = c.start_date;
        r.reporting_to = c.reporting_to;
      }
    }

    r.email = (r.email ?? "").trim();
    r.name = (r.name ?? "").replace(/\s+/g, " ").trim();

    if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
      problems.push(`Line ${lineNo}: ${r.email ? `"${r.email}" is not a valid email address` : "no email address found"}`);
      return;
    }
    if (!r.name) { problems.push(`Line ${lineNo}: no name for ${r.email}`); return; }

    if (rawDate) {
      const d = readDate(rawDate);
      if (d) r.start_date = d;
      else problems.push(`${r.name}: could not read the start date "${rawDate}" — write it as 15/09/2026, 2026-09-15 or 15 September 2026 — so the shared start date will be used`);
    }

    delete (r as any).first_name;
    delete (r as any).last_name;
    out.push(r);
  });

  // The same address twice means two letters to one person.
  const seen = new Set<string>();
  const rows = out.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) { problems.push(`${r.email} appears more than once and was included only once`); return false; }
    seen.add(key);
    return true;
  });

  if (!hasHeader && rows.length)
    notes.push("No header row, so each value was recognised by what it looks like. Check the line under each name before sending.");

  return { rows, problems: groupProblems(problems), notes };
}

/**
 * One line per distinct problem, not one per person.
 *
 * Twenty copies of the same sentence bury the one different message that
 * actually needs attention.
 */
function groupProblems(list: string[]): string[] {
  const byReason = new Map<string, string[]>();
  const order: string[] = [];
  for (const p of list) {
    const m = p.match(/^(.+?): (could not read the start date .+)$/);
    const key = m ? m[2] : p;
    if (!byReason.has(key)) { byReason.set(key, []); order.push(key); }
    if (m) byReason.get(key)!.push(m[1]);
  }
  return order.map((reason) => {
    const who = byReason.get(reason)!;
    if (!who.length) return reason;
    const names = who.length > 3 ? `${who.slice(0, 3).join(", ")} and ${who.length - 3} more` : who.join(", ");
    return `${who.length === 1 ? names : `${who.length} people (${names})`}: ${reason}`;
  });
}
