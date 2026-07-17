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
  async function rename(t: Tax) {
    const label = window.prompt("Rename option:", t.label);
    if (!label || label.trim() === t.label) return;
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename_taxonomy", id: t.id, data: { label: label.trim() } })
    });
    if (res.ok) setItems((c) => c.map((x) => (x.id === t.id ? { ...x, label: label.trim() } : x)));
  }
  async function remove(t: Tax) {
    if (!window.confirm(`Delete "${t.label}"? If it's in use it will be deactivated instead.`)) return;
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_taxonomy", id: t.id })
    });
    const json = await res.json();
    if (res.ok && !json.softened) setItems((c) => c.filter((x) => x.id !== t.id));
    else if (json.softened) setItems((c) => c.map((x) => (x.id === t.id ? { ...x, active: false } : x)));
  }

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {KINDS.map(([kind, title]) => (
        <div key={kind} className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">{title}</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {items.filter((t) => t.kind === kind).sort((a, b) => a.sort - b.sort).map((t) => (
              <span key={t.id}
                className={`inline-flex items-center gap-1.5 pl-3.5 pr-1.5 h-9 rounded-pill border text-xs font-semibold transition ${
                  t.active ? "bg-ink border-ink text-white" : "border-line text-muted-2"}`}>
                <button onClick={() => toggle(t)} title={t.active ? "Click to deactivate" : "Click to reactivate"}
                  className={t.active ? "" : "line-through"}>{t.label}</button>
                <button onClick={() => rename(t)} title="Rename"
                  className={`w-5 h-5 grid place-items-center rounded-full text-[10px] ${t.active ? "hover:bg-white/15" : "hover:bg-paper-2"}`}>✎</button>
                <button onClick={() => remove(t)} title="Delete"
                  className={`w-5 h-5 grid place-items-center rounded-full text-[10px] ${t.active ? "hover:bg-coral" : "hover:bg-paper-2 hover:text-coral"}`}>✕</button>
              </span>
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


type Chapter = { id: string; city: string; country: string; active: boolean };
export function ChapterManager({ chapters }: { chapters: Chapter[] }) {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function call(body: Record<string, any>) {
    setErr(null);
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); return; }
    router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Elite chapters</div>
      <div className="space-y-2 mb-4">
        {chapters.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-2.5">
            <span className={`flex-1 text-sm font-medium ${c.active ? "" : "text-muted-2 line-through"}`}>
              {c.city}, {c.country}
            </span>
            <button className="text-xs font-semibold text-muted hover:text-ink"
              onClick={() => {
                const nc = window.prompt("City:", c.city); if (!nc) return;
                const co = window.prompt("Country:", c.country); if (!co) return;
                call({ action: "update_chapter", id: c.id, data: { city: nc, country: co } });
              }}>✎ Edit</button>
            <button className="text-xs font-semibold text-muted hover:text-ink"
              onClick={() => call({ action: "update_chapter", id: c.id, data: { active: !c.active } })}>
              {c.active ? "Deactivate" : "Activate"}
            </button>
            <button className="text-xs font-semibold text-muted hover:text-coral"
              onClick={() => window.confirm(`Delete ${c.city} chapter?`) && call({ action: "delete_chapter", id: c.id })}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input !h-10 flex-1" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <input className="input !h-10 flex-1" placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        <button className="btn-ghost !h-10" onClick={() => {
          if (city.trim() && country.trim()) { call({ action: "create_chapter", data: { city: city.trim(), country: country.trim() } }); setCity(""); setCountry(""); }
        }}>＋</button>
      </div>
      {err && <p className="text-coral text-sm mt-3">{err}</p>}
    </div>
  );
}

type Plan = { id: string; name: string; price_ngn: number; price_usd: number; active: boolean };
export function PlanManager({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Plan[]>(plans);
  const [note, setNote] = useState<string | null>(null);
  const upd = (id: string, patch: Partial<Plan>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function save(p: Plan) {
    setNote(null);
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_plan", id: p.id, data: { name: p.name, price_ngn: p.price_ngn, price_usd: p.price_usd, active: p.active } })
    });
    setNote(res.ok ? "Saved ✓ — new subscribers pay the new price immediately." : "Save failed");
    router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Subscription plans</div>
      <div className="space-y-3">
        {rows.map((p) => (
          <div key={p.id} className="grid sm:grid-cols-[1fr_120px_110px_auto_auto] gap-3 items-end border border-line rounded-xl p-4">
            <div><label className="label">Plan name</label>
              <input className="input !h-10" value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} /></div>
            <div><label className="label">₦ / month</label>
              <input className="input !h-10" type="number" value={p.price_ngn} onChange={(e) => upd(p.id, { price_ngn: Number(e.target.value) })} /></div>
            <div><label className="label">$ / month</label>
              <input className="input !h-10" type="number" value={p.price_usd} onChange={(e) => upd(p.id, { price_usd: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2 text-xs font-semibold h-10">
              <input type="checkbox" className="accent-[#FC5647]" checked={p.active} onChange={(e) => upd(p.id, { active: e.target.checked })} /> active
            </label>
            <button className="btn-coral !h-10" onClick={() => save(p)}>Save</button>
          </div>
        ))}
      </div>
      {note && <p className="text-sm text-muted mt-3">{note}</p>}
    </div>
  );
}
