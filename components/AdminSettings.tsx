"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Bank = { bank: string; account_name: string; account_number: string; note?: string };

export function BankSettings({ ngn, usd }: { ngn: Bank; usd: Bank }) {
  const supabase = createClient();
  const [n, setN] = useState<Bank>(ngn);
  const [u, setU] = useState<Bank>(usd);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true); setNote(null);
    const r1 = await supabase.from("app_settings").update({ value: n }).eq("key", "bank_transfer_ngn");
    const r2 = await supabase.from("app_settings").update({ value: u }).eq("key", "bank_transfer_usd");
    setBusy(false);
    setNote(r1.error?.message ?? r2.error?.message ?? "Saved ✓");
  }

  const bankForm = (b: Bank, set: (b: Bank) => void, label: string) => (
    <div className="card p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">{label}</div>
      <div className="space-y-3">
        <div><label className="label">Bank</label>
          <input className="input !h-10" value={b.bank} onChange={(e) => set({ ...b, bank: e.target.value })} /></div>
        <div><label className="label">Account name</label>
          <input className="input !h-10" value={b.account_name} onChange={(e) => set({ ...b, account_name: e.target.value })} /></div>
        <div><label className="label">Account number</label>
          <input className="input !h-10" value={b.account_number} onChange={(e) => set({ ...b, account_number: e.target.value })} /></div>
        <div><label className="label">Note (optional)</label>
          <input className="input !h-10" value={b.note ?? ""} onChange={(e) => set({ ...b, note: e.target.value })} /></div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid lg:grid-cols-2 gap-5 mb-4">
        {bankForm(n, setN, "₦ NGN transfer details")}
        {bankForm(u, setU, "$ USD transfer details (domiciliary)")}
      </div>
      <div className="flex items-center gap-4">
        <button className="btn-coral" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save bank details"}</button>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
    </div>
  );
}

type Tax = { id: string; kind: string; label: string; active: boolean; sort: number };
const KINDS = [["niche", "Niches"], ["career_goal", "Career goals"], ["expertise", "Expertise areas"], ["sector", "Sectors"]] as const;

export function TaxonomyManager({ taxonomies }: { taxonomies: Tax[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<Tax[]>(taxonomies);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});

  async function add(kind: string) {
    const label = (newLabels[kind] ?? "").trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const sort = items.filter((t) => t.kind === kind).length + 1;
    const { data, error } = await supabase.from("taxonomies")
      .insert({ kind: kind as any, label, slug, sort }).select("*").single();
    if (!error && data) {
      setItems((c) => [...c, data as any]);
      setNewLabels((c) => ({ ...c, [kind]: "" }));
      router.refresh();
    }
  }
  async function toggle(t: Tax) {
    await supabase.from("taxonomies").update({ active: !t.active }).eq("id", t.id);
    setItems((c) => c.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)));
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {KINDS.map(([kind, title]) => (
        <div key={kind} className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">{title}</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {items.filter((t) => t.kind === kind).sort((a, b) => a.sort - b.sort).map((t) => (
              <button key={t.id} onClick={() => toggle(t)}
                title={t.active ? "Click to deactivate" : "Click to reactivate"}
                className={`px-3.5 h-9 rounded-pill border text-xs font-semibold transition ${
                  t.active ? "bg-ink border-ink text-white" : "border-line text-muted-2 line-through"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input !h-10 flex-1" placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}…`}
              value={newLabels[kind] ?? ""}
              onChange={(e) => setNewLabels((c) => ({ ...c, [kind]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add(kind)} />
            <button className="btn-ghost !h-10" onClick={() => add(kind)}>＋</button>
          </div>
        </div>
      ))}
    </div>
  );
}
