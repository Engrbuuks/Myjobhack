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
  const v = String(raw ?? "").trim().replace(/^["']|["']$/g, "");
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

function headerField(cell: string): Field | null {
  const c = cell.trim().replace(/[*:]+$/, "").trim();
  for (const [f, re] of HEADERS) if (re.test(c)) return f;
  return null;
}

const clean = (v: string | undefined) => {
  const t = String(v ?? "").trim().replace(/^["']|["']$/g, "").trim();
  return t || undefined;
};

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
        const rest = others.slice(ni + 1);
        r.position = rest[0] || undefined;
        r.salary = rest[1] || undefined;
        rawDate = rest[2] || undefined;
        r.reporting_to = rest[3] || undefined;
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
      else problems.push(`${r.name}: could not read the start date "${rawDate}", so the shared start date will be used`);
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

  return { rows, problems, notes };
}
