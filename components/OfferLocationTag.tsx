"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/apiClient";
import type { OfferLocation } from "@/lib/offerLocations";

/**
 * Tag a sent offer with its location by hand.
 *
 * For offers sent before locations existed, which are deliberately left
 * untagged rather than guessed. Only places already in the list can be
 * chosen here; a new place is added from an offer form, so this stays a
 * pick and never a typed name. The letter itself is not changed.
 */
export function OfferLocationTag({ offerId, current, locations }: {
  offerId: string;
  current: OfferLocation | null;
  locations: OfferLocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(current?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await callApi("/api/admin/offer", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId, action: "tag", location_id: pick || null })
      });
      if (!r.ok) { setErr(r.error); return; }
      setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!open)
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide ${
          current ? "bg-paper-2 text-ink" : "border border-dashed border-line text-muted-2"}`}>
          {current ? current.name : "Not tagged"}
        </span>
        {locations.length > 0 && (
          <button type="button" onClick={() => setOpen(true)}
            className="text-[11px] text-muted-2 hover:text-coral underline underline-offset-2">
            {current ? "change" : "tag"}
          </button>
        )}
      </span>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select className="input !h-8 !py-0 text-xs w-auto" value={pick} autoFocus
        onChange={(e) => setPick(e.target.value)}>
        <option value="">Not tagged</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button type="button" className="btn-coral !h-8 text-xs" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn-ghost !h-8 text-xs" disabled={busy}
        onClick={() => { setOpen(false); setPick(current?.id ?? ""); setErr(null); }}>Cancel</button>
      {err && <span className="text-xs text-coral w-full">{err}</span>}
    </span>
  );
}

