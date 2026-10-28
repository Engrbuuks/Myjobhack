"use client";
import { useEffect, useState } from "react";
import { callApi, postJson } from "@/lib/apiClient";
import { locationKey, type OfferLocation } from "@/lib/offerLocations";

/** What the offer route accepts: an id from the list, or a name it will add. */
export type PickedLocation = { id: string | null; name: string } | null;

export function locationPayload(v: PickedLocation) {
  if (!v) return {};
  return v.id ? { location_id: v.id } : { location_name: v.name };
}

/**
 * Which location an offer is for. Picked, never typed into the offer.
 *
 * The job's own locations come first, because that is where the role was
 * posted. A new place is added to the list through its own button, so the
 * next offer picks the same spelling rather than typing a variant.
 *
 * What the candidate wrote on the application form is shown as a hint, and
 * preselects only an exact match. It is never added to the list on its own,
 * because what someone typed in an application is not a decision about where
 * they are being offered.
 */
export function OfferLocationPicker({ value, onChange, jobId, applicationId, onList }: {
  value: PickedLocation;
  onChange: (v: PickedLocation) => void;
  jobId?: string;
  applicationId?: string;
  /** Hands the loaded list to the parent, for matching per row locations in a pasted list. */
  onList?: (list: OfferLocation[]) => void;
}) {
  const [list, setList] = useState<OfferLocation[]>([]);
  const [suggestions, setSuggestions] = useState<{ name: string; id: string | null }[]>([]);
  const [applied, setApplied] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const qs = applicationId ? `?application_id=${encodeURIComponent(applicationId)}`
        : jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";
      const r = await callApi(`/api/admin/offer-locations${qs}`);
      if (!r.ok) { setErr(r.error); return; }
      const l: OfferLocation[] = r.data?.locations ?? [];
      const s = r.data?.suggestions ?? [];
      setList(l); setSuggestions(s); setApplied(r.data?.applied ?? null);
      onList?.(l);

      // Preselect only on an exact match, and only when nothing is chosen yet.
      const hint = r.data?.applied as string | null;
      if (hint && !value) {
        const k = locationKey(hint);
        const hit = s.find((x: any) => locationKey(x.name) === k) ?? l.find((x) => locationKey(x.name) === k);
        if (hit) onChange({ id: hit.id ?? null, name: hit.name });
      }
    })();
    // Loaded once per offer form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, applicationId]);

  async function addNew() {
    setBusy(true); setErr(null);
    try {
      const r = await postJson("/api/admin/offer-locations", { name: newName });
      if (!r.ok) { setErr(r.error); return; }
      const loc: OfferLocation = r.data.location;
      const next = list.some((x) => x.id === loc.id) ? list
        : [...list, loc].sort((a, b) => a.name.localeCompare(b.name));
      setList(next); onList?.(next);
      onChange({ id: loc.id, name: loc.name });
      setAdding(false); setNewName("");
      if (!r.data.created) setErr(`${loc.name} was already in the list, so that one is chosen.`);
    } finally { setBusy(false); }
  }

  const suggestionKeys = new Set(suggestions.map((s) => locationKey(s.name)));
  const others = list.filter((l) => !suggestionKeys.has(locationKey(l.name)));
  const encoded = !value ? "" : value.id ? `id:${value.id}` : `name:${value.name}`;

  function pick(v: string) {
    if (v === "__add") { setAdding(true); return; }
    if (!v) return onChange(null);
    if (v.startsWith("id:")) {
      const id = v.slice(3);
      const hit = list.find((l) => l.id === id) ?? suggestions.find((s) => s.id === id);
      return onChange({ id, name: hit?.name ?? "" });
    }
    onChange({ id: null, name: v.slice(5) });
  }

  return (
    <div>
      <label className="label !text-xs">Location</label>
      {!adding ? (
        <select className="input !h-10 text-sm" value={encoded} onChange={(e) => pick(e.target.value)}>
          <option value="">Not tagged</option>
          {suggestions.length > 0 && (
            <optgroup label="Where this job was posted">
              {suggestions.map((s) => (
                <option key={s.name} value={s.id ? `id:${s.id}` : `name:${s.name}`}>{s.name}</option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={suggestions.length ? "Other locations" : "Locations"}>
              {others.map((l) => <option key={l.id} value={`id:${l.id}`}>{l.name}</option>)}
            </optgroup>
          )}
          <option value="__add">Add a location to the list…</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input className="input !h-10 flex-1" value={newName} autoFocus maxLength={80}
            placeholder="Ikeja" onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { e.preventDefault(); addNew(); } }} />
          <button type="button" className="btn-coral !h-10 text-xs" disabled={busy || !newName.trim()}
            onClick={addNew}>{busy ? "Adding…" : "Add"}</button>
          <button type="button" className="btn-ghost !h-10 text-xs" disabled={busy}
            onClick={() => { setAdding(false); setNewName(""); }}>Cancel</button>
        </div>
      )}
      <p className="text-xs text-muted-2 mt-1">
        {applied
          ? <>They wrote <strong className="text-ink">{applied}</strong> on their application. </>
          : null}
        Counted on the Offers page. Put {"{location}"} in the letter to show it to the candidate.
      </p>
      {err && <p className="text-xs text-coral mt-1">{err}</p>}
    </div>
  );
}
