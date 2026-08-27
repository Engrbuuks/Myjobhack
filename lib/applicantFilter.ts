/**
 * Applicant filtering — every field, typed.
 *
 * The old approach derived filters from the ANSWERS that happened to arrive:
 * a question was filterable only if its answers repeated. That silently dropped
 * numbers ("years of experience" has too many distinct values), free text,
 * dates, and files — and it could never express ">= 3" because every answer had
 * already been flattened to a string before the table saw it.
 *
 * This engine works from the FORM DEFINITION instead. Every field on the form
 * is filterable, with the operators that actually make sense for its type, and
 * answers keep their real shape (number, boolean, array, date) all the way
 * through. Core application fields — stage, fit score, applied date, résumé —
 * sit in the same list so one bar covers everything an employer can screen on.
 */

export type FieldType =
  | "text" | "textarea" | "number" | "select"
  | "multiselect" | "boolean" | "date" | "file";

export type Op =
  | "contains" | "not_contains" | "equals" | "not_equals"
  | "any_of" | "none_of"
  | "includes_any" | "includes_all"
  | "gte" | "lte" | "between"
  | "before" | "after"
  | "is_true" | "is_false"
  | "answered" | "not_answered";

/** A field the user can filter on — either a form question or a core column. */
export type FilterField = {
  key: string;                 // "answer:<field_id>" | "core:<name>"
  label: string;
  type: FieldType;
  source: "answer" | "core";
  options?: string[];          // declared options (select/multiselect) or discovered values
};

export type Rule = {
  id: string;
  key: string;
  op: Op;
  value?: any;                 // primary operand
  value2?: any;                // upper bound for `between`
};

export type MatchMode = "all" | "any";

/** The row shape the applicant table already produces. */
export type FilterableRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  ai_fit_score: number | null;
  rules_passed: boolean | null;
  guest?: boolean;
  resumeUrl: string | null;
  card?: { competency_band?: string | null } | null;
  /** What the CV mentions, from a keyword scan. A hint, never a declared answer. */
  resume_hint?: string | null;
  answers: { field_id?: string; label: string; value: string; raw?: any }[];
};

/* ------------------------------------------------------------------ *
 * Operators per type
 * ------------------------------------------------------------------ */

export const OPS_FOR_TYPE: Record<FieldType, Op[]> = {
  text:        ["contains", "not_contains", "equals", "not_equals", "answered", "not_answered"],
  textarea:    ["contains", "not_contains", "answered", "not_answered"],
  number:      ["gte", "lte", "between", "equals", "answered", "not_answered"],
  select:      ["any_of", "none_of", "answered", "not_answered"],
  multiselect: ["includes_any", "includes_all", "none_of", "answered", "not_answered"],
  boolean:     ["is_true", "is_false", "answered", "not_answered"],
  date:        ["after", "before", "between", "answered", "not_answered"],
  file:        ["answered", "not_answered"]
};

export const OP_LABEL: Record<Op, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is",
  not_equals: "is not",
  any_of: "is any of",
  none_of: "is none of",
  includes_any: "includes any of",
  includes_all: "includes all of",
  gte: "is at least",
  lte: "is at most",
  between: "is between",
  before: "is before",
  after: "is after",
  is_true: "is yes",
  is_false: "is no",
  answered: "was answered",
  not_answered: "was not answered"
};

/** Operators that take no operand — the value inputs stay hidden. */
export const NULLARY_OPS: Op[] = ["answered", "not_answered", "is_true", "is_false"];

/* ------------------------------------------------------------------ *
 * Coercion
 * ------------------------------------------------------------------ */

/**
 * Number inputs post their value as a string, so a "years of experience"
 * answer arrives as "3", not 3. Some applicants also type "3 years" into a
 * text field that was later changed to a number. Pull the first number out
 * rather than failing the comparison outright.
 */
export function toNumber(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function toArray(v: any): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  // A stringified multiselect ("A, B") — but never split a free-text answer,
  // which legitimately contains commas. Callers pass raw values where possible.
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

export function toDate(v: any): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Empty means "no answer" — an unticked box, a skipped optional question. */
export function isEmpty(v: any): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/* ------------------------------------------------------------------ *
 * Reading a value off a row
 * ------------------------------------------------------------------ */

export function valueFor(row: FilterableRow, field: FilterField): any {
  if (field.source === "answer") {
    const fid = field.key.slice("answer:".length);
    const a = (row.answers ?? []).find((x) => x.field_id === fid);
    if (!a) return null;
    // Prefer the raw value: it still knows it is a number, boolean or array.
    return a.raw !== undefined ? a.raw : a.value;
  }
  switch (field.key) {
    case "core:name":       return row.name === "—" ? null : row.name;
    case "core:email":      return row.email;
    case "core:status":     return row.status;
    case "core:fit":        return row.ai_fit_score;
    case "core:band":       return row.card?.competency_band ?? null;
    case "core:applied":    return row.created_at;
    case "core:source":     return row.guest ? "Guest" : "Registered";
    case "core:resume":     return row.resumeUrl ? "uploaded" : null;
    case "core:rules":      return row.rules_passed;
    case "core:resume_hint": return row.resume_hint ?? null;
    default:                return null;
  }
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

/**
 * Does one applicant satisfy one rule?
 *
 * An unanswered question fails every operator except `not_answered`,
 * `not_contains`, `not_equals` and `none_of` — a candidate who never answered
 * "Do you have a driving licence?" genuinely is not one of the people who
 * said yes, but neither should they surface under "is Lagos".
 */
export function matchesRule(row: FilterableRow, field: FilterField, rule: Rule): boolean {
  const v = valueFor(row, field);
  const empty = isEmpty(v);

  if (rule.op === "answered") return !empty;
  if (rule.op === "not_answered") return empty;
  if (empty) return ["not_contains", "not_equals", "none_of"].includes(rule.op);

  switch (rule.op) {
    case "contains":
      return String(v).toLowerCase().includes(String(rule.value ?? "").toLowerCase());
    case "not_contains":
      return !String(v).toLowerCase().includes(String(rule.value ?? "").toLowerCase());
    case "equals":
      if (field.type === "number") {
        const n = toNumber(v), t = toNumber(rule.value);
        return n != null && t != null && n === t;
      }
      return String(v).trim().toLowerCase() === String(rule.value ?? "").trim().toLowerCase();
    case "not_equals":
      return String(v).trim().toLowerCase() !== String(rule.value ?? "").trim().toLowerCase();

    case "any_of": {
      const want = (rule.value ?? []) as string[];
      if (!want.length) return true;
      return want.some((w) => String(v).trim().toLowerCase() === w.trim().toLowerCase());
    }
    case "none_of": {
      const want = (rule.value ?? []) as string[];
      if (!want.length) return true;
      const held = field.type === "multiselect" ? toArray(v) : [String(v)];
      return !want.some((w) => held.some((h) => h.trim().toLowerCase() === w.trim().toLowerCase()));
    }
    case "includes_any": {
      const want = (rule.value ?? []) as string[];
      if (!want.length) return true;
      const held = toArray(v).map((h) => h.toLowerCase());
      return want.some((w) => held.includes(w.trim().toLowerCase()));
    }
    case "includes_all": {
      const want = (rule.value ?? []) as string[];
      if (!want.length) return true;
      const held = toArray(v).map((h) => h.toLowerCase());
      return want.every((w) => held.includes(w.trim().toLowerCase()));
    }

    case "gte": {
      const n = toNumber(v), t = toNumber(rule.value);
      return n != null && t != null && n >= t;
    }
    case "lte": {
      const n = toNumber(v), t = toNumber(rule.value);
      return n != null && t != null && n <= t;
    }
    case "between": {
      if (field.type === "date") {
        const d = toDate(v), lo = toDate(rule.value), hi = toDate(rule.value2);
        if (d == null) return false;
        if (lo != null && d < lo) return false;
        if (hi != null && d > hi + 86_399_999) return false;   // include the whole end day
        return true;
      }
      const n = toNumber(v), lo = toNumber(rule.value), hi = toNumber(rule.value2);
      if (n == null) return false;
      if (lo != null && n < lo) return false;
      if (hi != null && n > hi) return false;
      return true;
    }
    case "before": {
      const d = toDate(v), t = toDate(rule.value);
      return d != null && t != null && d < t;
    }
    case "after": {
      const d = toDate(v), t = toDate(rule.value);
      return d != null && t != null && d > t + 86_399_999;
    }

    case "is_true":  return v === true || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes";
    case "is_false": return v === false || String(v).toLowerCase() === "false" || String(v).toLowerCase() === "no";

    default: return true;
  }
}

/** Apply the whole rule set. Incomplete rules are ignored, not treated as false. */
export function applyRules(
  rows: FilterableRow[], fields: FilterField[], rules: Rule[], mode: MatchMode
): FilterableRow[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const live = rules.filter((r) => {
    const f = byKey.get(r.key);
    if (!f) return false;
    if (NULLARY_OPS.includes(r.op)) return true;
    if (r.op === "between") return r.value !== "" && r.value != null
      || r.value2 !== "" && r.value2 != null;
    if (["any_of", "none_of", "includes_any", "includes_all"].includes(r.op))
      return Array.isArray(r.value) && r.value.length > 0;
    return r.value !== "" && r.value != null;
  });
  if (!live.length) return rows;

  return rows.filter((row) =>
    mode === "all"
      ? live.every((r) => matchesRule(row, byKey.get(r.key)!, r))
      : live.some((r) => matchesRule(row, byKey.get(r.key)!, r))
  );
}

/* ------------------------------------------------------------------ *
 * Building the field list
 * ------------------------------------------------------------------ */

const CORE_FIELDS: FilterField[] = [
  { key: "core:status",  label: "Stage",           type: "select", source: "core" },
  { key: "core:fit",     label: "Fit score",       type: "number", source: "core" },
  { key: "core:band",    label: "Competency band", type: "select", source: "core" },
  { key: "core:applied", label: "Date applied",    type: "date",   source: "core" },
  { key: "core:name",    label: "Name",            type: "text",   source: "core" },
  { key: "core:email",   label: "Email",           type: "text",   source: "core" },
  { key: "core:source",  label: "Applied as",      type: "select", source: "core",
    options: ["Guest", "Registered"] },
  { key: "core:resume",  label: "Résumé",          type: "file",   source: "core" },
  { key: "core:rules",   label: "Passed screening", type: "boolean", source: "core" },
  // Populated by the résumé keyword scan. Kept clearly separate from the
  // applicant's own answers so a guess is never mistaken for a declaration.
  { key: "core:resume_hint", label: "Résumé mentions", type: "text", source: "core" }
];

/**
 * Every filterable field: the job's own questions first (that is what the
 * employer is thinking about), then the core application columns.
 *
 * Options come from the form definition where declared. For select fields
 * without declared options — and for the core stage/band columns — we fall
 * back to the values that actually appear, so the picker never offers a
 * choice that would return nobody.
 */
export function buildFilterFields(
  formFields: { id: string; label: string; type: string; options?: string[] | null }[],
  rows: FilterableRow[]
): FilterField[] {
  const answerFields: FilterField[] = (formFields ?? []).map((f) => {
    const type = (["text", "textarea", "number", "select", "multiselect", "boolean", "date", "file"]
      .includes(f.type) ? f.type : "text") as FieldType;
    let options = f.options ?? undefined;
    if (!options?.length && (type === "select" || type === "multiselect")) {
      options = discoverValues(rows, `answer:${f.id}`, type);
    }
    return { key: `answer:${f.id}`, label: f.label, type, source: "answer", options: options ?? undefined };
  });

  const core = CORE_FIELDS.map((f) => {
    if (f.key === "core:status" || f.key === "core:band") {
      return { ...f, options: discoverValues(rows, f.key, "select") };
    }
    return f;
  }).filter((f) => f.key !== "core:band" || (f.options?.length ?? 0) > 0);

  return [...answerFields, ...core];
}

/** Distinct values actually present, most common first. */
function discoverValues(rows: FilterableRow[], key: string, type: FieldType): string[] {
  const field = { key, label: "", type, source: key.startsWith("answer:") ? "answer" : "core" } as FilterField;
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const v = valueFor(r, field);
    if (isEmpty(v)) return;
    const vals = type === "multiselect" || Array.isArray(v) ? toArray(v) : [String(v).trim()];
    vals.filter(Boolean).forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/** Values present for one field, with counts — shown beside each option. */
export function valueCounts(rows: FilterableRow[], field: FilterField): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const v = valueFor(r, field);
    if (isEmpty(v)) return;
    const vals = field.type === "multiselect" || Array.isArray(v) ? toArray(v) : [String(v).trim()];
    vals.filter(Boolean).forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

/** How many applicants left this field blank — surfaced so gaps are visible. */
export function unansweredCount(rows: FilterableRow[], field: FilterField): number {
  return rows.filter((r) => isEmpty(valueFor(r, field))).length;
}

/** A rule in words, for the chip and for the export filename. */
export function describeRule(field: FilterField, rule: Rule): string {
  const op = OP_LABEL[rule.op];
  if (NULLARY_OPS.includes(rule.op)) return `${field.label} ${op}`;
  if (rule.op === "between") return `${field.label} ${op} ${rule.value || "…"} and ${rule.value2 || "…"}`;
  if (Array.isArray(rule.value)) return `${field.label} ${op} ${rule.value.join(", ")}`;
  return `${field.label} ${op} ${rule.value}`;
}

/** A fresh rule with a sensible default operator for the field's type. */
export function newRule(field: FilterField): Rule {
  const op = OPS_FOR_TYPE[field.type][0];
  return {
    id: `${field.key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key: field.key,
    op,
    value: ["any_of", "none_of", "includes_any", "includes_all"].includes(op) ? [] : "",
    value2: ""
  };
}
