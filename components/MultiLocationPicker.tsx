"use client";
import { useState } from "react";
import { COUNTRIES, STATES } from "@/lib/geo";

export type JobLocation = { country: string; state: string | null };

/** Add multiple countries/states a role recruits across. state=null means whole country. */
export function MultiLocationPicker({
  value, onChange
}: { value: JobLocation[]; onChange: (v: JobLocation[]) => void }) {
  const [country, setCountry] = useState<string>("Nigeria");
  const [state, setState] = useState<string>("");

  const states = STATES[country] ?? [];

  function add() {
    const entry: JobLocation = { country, state: state || null };
    // avoid duplicates
    const exists = value.some((l) => l.country === entry.country && l.state === entry.state);
    // adding "whole country" clears the specific states for that country
    let next = value;
    if (!entry.state) next = value.filter((l) => l.country !== entry.country);
    if (!exists) onChange([...next, entry]);
    setState("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className="label">Recruiting locations</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {value.length === 0 && <span className="text-sm text-muted-2">No locations added — add one or more below.</span>}
        {value.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-2 bg-paper-2 border border-line rounded-pill px-3 py-1.5 text-sm">
            <span className="font-semibold">{l.state ? `${l.state}, ${l.country}` : `${l.country} (all)`}</span>
            <button type="button" onClick={() => remove(i)} className="text-muted-2 hover:text-coral">✕</button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <select className="input" value={country} onChange={(e) => { setCountry(e.target.value); setState(""); }}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Whole country</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button type="button" className="btn-ghost !h-11 shrink-0" onClick={add}>+ Add</button>
      </div>
      <p className="text-xs text-muted-2 mt-2">
        Add each country or state this role covers. Choose "Whole country" to cover everywhere in that country.
      </p>
    </div>
  );
}
