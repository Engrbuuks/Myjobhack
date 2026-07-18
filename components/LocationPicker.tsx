"use client";
import { COUNTRIES, STATES } from "@/lib/geo";

export function LocationPicker({
  country, city, onCountry, onCity, dark, labels = true, required
}: {
  country: string; city: string;
  onCountry: (v: string) => void; onCity: (v: string) => void;
  dark?: boolean; labels?: boolean; required?: boolean;
}) {
  const states = STATES[country] ?? [];
  const cls = dark
    ? "w-full h-11 rounded-xl bg-white/[.07] border border-white/12 px-4 text-sm text-white outline-none focus:border-coral/60 transition"
    : "input";

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        {labels && <label className={dark ? "block text-[11px] font-bold text-white/55 mb-1.5" : "label"}>Country{required && <span className="text-coral"> *</span>}</label>}
        <select className={cls} value={country} onChange={(e) => { onCountry(e.target.value); onCity(""); }}>
          <option value="" className="text-ink">Select country…</option>
          {COUNTRIES.map((c) => <option key={c} value={c} className="text-ink">{c}</option>)}
        </select>
      </div>
      <div>
        {labels && <label className={dark ? "block text-[11px] font-bold text-white/55 mb-1.5" : "label"}>{states.length ? "State / Region" : "City"}{required && <span className="text-coral"> *</span>}</label>}
        {states.length ? (
          <select className={cls} value={city} onChange={(e) => onCity(e.target.value)} disabled={!country}>
            <option value="" className="text-ink">{country ? "Select…" : "Choose a country first"}</option>
            {states.map((s) => <option key={s} value={s} className="text-ink">{s}</option>)}
          </select>
        ) : (
          <input className={cls} placeholder="City" value={city} onChange={(e) => onCity(e.target.value)} disabled={!country} />
        )}
      </div>
    </div>
  );
}
