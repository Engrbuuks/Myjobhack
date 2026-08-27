"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
};
const SelectionCtx = createContext<Ctx | null>(null);

export function useSelection() {
  const c = useContext(SelectionCtx);
  if (!c) throw new Error("useSelection must be used within PoolSelectionProvider");
  return c;
}

export function PoolSelectionProvider({ allIds, children }: { allIds: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  function selectAllVisible() {
    setSelected((s) => {
      if (allSelected) return new Set();
      const n = new Set(s); allIds.forEach((id) => n.add(id)); return n;
    });
  }

  async function invite(everyone: boolean) {
    setSending(true); setNote(null);
    const res = await fetch("/api/admin/request-profile-update", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(everyone ? { select_all: true } : { profile_ids: Array.from(selected) })
    });
    const json = await res.json();
    setSending(false);
    if (res.ok) { setNote(`Invite sent to ${json.sent} ${json.sent === 1 ? "person" : "people"}.`); setSelected(new Set()); }
    else setNote(json.error ?? "Failed to send.");
  }

  return (
    <SelectionCtx.Provider value={{ selected, toggle, isSelected }}>
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-paper-2 border border-line">
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={allSelected} onChange={selectAllVisible} />
          Select all shown ({allIds.length})
        </label>
        <span className="text-sm text-muted-2">{selected.size} selected</span>
        <div className="flex-1" />
        <button className="btn-ghost !h-9 text-sm" disabled={sending || selected.size === 0}
          onClick={() => invite(false)}>
          {sending ? "Sending…" : `Invite selected (${selected.size})`}
        </button>
        <button className="btn-coral !h-9 text-sm" disabled={sending}
          onClick={() => { if (confirm("Send a profile-update invite to EVERY talent in the pool?")) invite(true); }}>
          Invite everyone
        </button>
        {note && <span className="w-full text-sm text-green-600 font-semibold">{note}</span>}
      </div>
      {children}
    </SelectionCtx.Provider>
  );
}

/** A checkbox cell for a table row. */
export function RowCheckbox({ id }: { id: string }) {
  const { isSelected, toggle } = useSelection();
  return (
    <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={isSelected(id)} onChange={() => toggle(id)} />
  );
}
