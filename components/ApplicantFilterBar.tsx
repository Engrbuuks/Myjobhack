"use client";
import { useState, useRef, useEffect } from "react";
import {
  type FilterField, type Rule, type MatchMode, type FilterableRow,
  OPS_FOR_TYPE, OP_LABEL, NULLARY_OPS,
  valueCounts, unansweredCount, newRule
} from "@/lib/applicantFilter";

/**
 * Filter applicants on any field the job actually asks about.
 *
 * A dropdown per question does not scale — a 20-question form would need 20
 * controls permanently on screen, most of them unused. Instead the employer
 * adds the filters they want: pick a field, pick how to compare, set a value.
 * Every field on the form is available, whatever its type.
 */
export function ApplicantFilterBar({
  fields, rows, rules, setRules, mode, setMode, matched, total
}: {
  fields: FilterField[];
  rows: FilterableRow[];
  rules: Rule[];
  setRules: (r: Rule[]) => void;
  mode: MatchMode;
  setMode: (m: MatchMode) => void;
  matched: number;
  total: number;
}) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picking) return;
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicking(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [picking]);

  const byKey = new Map(fields.map((f) => [f.key, f]));
  const questions = fields.filter((f) => f.source === "answer");
  const core = fields.filter((f) => f.source === "core");

  const shown = (list: FilterField[]) =>
    search.trim() ? list.filter((f) => f.label.toLowerCase().includes(search.toLowerCase())) : list;

  function add(field: FilterField) {
    setRules([...rules, newRule(field)]);
    setPicking(false);
    setSearch("");
  }
  function update(id: string, patch: Partial<Rule>) {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    setRules(rules.filter((r) => r.id !== id));
  }

  return (
    <div className="rounded-card border border-line bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">Filters</span>

        {rules.length > 1 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-2">Match</span>
            <div className="inline-flex rounded-pill border border-line overflow-hidden">
              {(["all", "any"] as MatchMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 h-7 font-semibold capitalize transition ${
                    mode === m ? "bg-ink text-white" : "bg-white text-muted hover:text-ink"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        <span className="text-xs text-muted-2">
          <strong className="text-ink">{matched}</strong> of {total} applicants
        </span>
        {rules.length > 0 && (
          <button className="btn-ghost !h-8 text-xs" onClick={() => setRules([])}>Clear all</button>
        )}
      </div>

      {rules.map((rule) => {
        const field = byKey.get(rule.key);
        if (!field) return null;
        return (
          <RuleRow key={rule.id} rule={rule} field={field} rows={rows}
            onChange={(patch) => update(rule.id, patch)} onRemove={() => remove(rule.id)} />
        );
      })}

      <div className="relative" ref={pickerRef}>
        <button className="btn-ghost !h-9 text-xs" onClick={() => setPicking((p) => !p)}>
          ＋ Add filter
        </button>

        {picking && (
          <div className="absolute z-40 mt-2 w-80 max-h-96 overflow-y-auto rounded-card border border-line bg-white shadow-xl p-2">
            <input autoFocus className="input !h-9 text-xs mb-2" placeholder="Find a field…"
              value={search} onChange={(e) => setSearch(e.target.value)} />

            {questions.length > 0 && (
              <>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-2">
                  This job&rsquo;s questions
                </div>
                {shown(questions).map((f) => (
                  <FieldOption key={f.key} field={f} rows={rows} onPick={() => add(f)} />
                ))}
                {shown(questions).length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-2">No question matches that.</div>
                )}
              </>
            )}

            <div className="px-2 py-1 mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-2">
              Application details
            </div>
            {shown(core).map((f) => (
              <FieldOption key={f.key} field={f} rows={rows} onPick={() => add(f)} />
            ))}
          </div>
        )}

        {questions.length === 0 && rules.length === 0 && (
          <p className="text-xs text-muted-2 mt-2">
            This job has no custom questions yet. Add fields to its application form and every
            one of them becomes filterable here.
          </p>
        )}
      </div>
    </div>
  );
}

/** One row in the field picker — name, type, and how many people left it blank. */
function FieldOption({ field, rows, onPick }: {
  field: FilterField; rows: FilterableRow[]; onPick: () => void;
}) {
  const blank = unansweredCount(rows, field);
  return (
    <button onClick={onPick}
      className="w-full text-left px-2 py-2 rounded-xl hover:bg-paper-2 transition flex items-baseline gap-2">
      <span className="text-sm font-medium text-ink flex-1 truncate">{field.label}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-2 shrink-0">{field.type}</span>
      {blank > 0 && (
        <span className="text-[10px] text-muted-2 shrink-0" title={`${blank} left this blank`}>
          {blank} blank
        </span>
      )}
    </button>
  );
}

/** Field · operator · value(s) · remove. */
function RuleRow({ rule, field, rows, onChange, onRemove }: {
  rule: Rule; field: FilterField; rows: FilterableRow[];
  onChange: (patch: Partial<Rule>) => void; onRemove: () => void;
}) {
  const ops = OPS_FOR_TYPE[field.type];
  const multi = ["any_of", "none_of", "includes_any", "includes_all"].includes(rule.op);
  const counts = multi ? valueCounts(rows, field) : [];
  const selected: string[] = Array.isArray(rule.value) ? rule.value : [];

  function toggleValue(v: string) {
    onChange({ value: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] });
  }

  function changeOp(op: string) {
    const nextMulti = ["any_of", "none_of", "includes_any", "includes_all"].includes(op);
    onChange({ op: op as any, value: nextMulti ? [] : "", value2: "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper-2 border border-line px-3 py-2">
      <span className="text-sm font-semibold text-ink max-w-48 truncate" title={field.label}>
        {field.label}
      </span>

      <select className="input !h-8 !w-auto text-xs !px-2" value={rule.op}
        onChange={(e) => changeOp(e.target.value)}>
        {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
      </select>

      {!NULLARY_OPS.includes(rule.op) && (
        <>
          {multi ? (
            <div className="flex flex-wrap items-center gap-1">
              {counts.length === 0 && (
                <span className="text-xs text-muted-2">No answers yet</span>
              )}
              {counts.map((c) => (
                <button key={c.value} onClick={() => toggleValue(c.value)}
                  className={`rounded-pill border px-2.5 h-7 text-xs font-medium transition ${
                    selected.includes(c.value)
                      ? "bg-coral border-coral text-white"
                      : "bg-white border-line text-muted hover:border-ink"}`}>
                  {c.value} <span className="opacity-60">{c.count}</span>
                </button>
              ))}
            </div>
          ) : field.type === "number" ? (
            <>
              <input className="input !h-8 !w-24 text-xs" type="number" placeholder="value"
                value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
              {rule.op === "between" && (
                <>
                  <span className="text-xs text-muted-2">and</span>
                  <input className="input !h-8 !w-24 text-xs" type="number" placeholder="value"
                    value={rule.value2 ?? ""} onChange={(e) => onChange({ value2: e.target.value })} />
                </>
              )}
            </>
          ) : field.type === "date" ? (
            <>
              <input className="input !h-8 !w-40 text-xs" type="date"
                value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
              {rule.op === "between" && (
                <>
                  <span className="text-xs text-muted-2">and</span>
                  <input className="input !h-8 !w-40 text-xs" type="date"
                    value={rule.value2 ?? ""} onChange={(e) => onChange({ value2: e.target.value })} />
                </>
              )}
            </>
          ) : (
            <input className="input !h-8 !w-52 text-xs" placeholder="type a value…"
              value={rule.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
          )}
        </>
      )}

      <div className="flex-1" />
      <button onClick={onRemove}
        className="w-7 h-7 rounded-lg text-muted-2 hover:bg-coral-soft hover:text-coral transition shrink-0"
        title="Remove this filter">✕</button>
    </div>
  );
}
