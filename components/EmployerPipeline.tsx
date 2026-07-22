"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES, templateByKey, suggestTemplate } from "@/lib/outreach";
import { ExportButton } from "@/components/ExportButton";

type P = {
  id: string; company: string; sector: string | null; city: string | null;
  tier: number; contact_name: string; contact_role: string | null;
  contact_email: string | null; linkedin_url: string | null;
  hires_roles: string | null; hiring_now: boolean;
  stage: string; next_action: string | null; next_action_at: string | null;
  touches: number; last_contacted_at: string | null; quarterly_list: boolean;
  notes: string | null;
};

const STAGES = [
  ["to_contact", "To contact"], ["contacted", "Contacted"],
  ["follow_up_1", "Follow-up 1"], ["follow_up_2", "Follow-up 2"],
  ["replied", "Replied"], ["call_booked", "Call booked"],
  ["proposal", "Proposal"], ["won", "Won"],
  ["not_now", "Not now"], ["lost", "Lost"]
];
const label = (s: string) => STAGES.find(x => x[0] === s)?.[1] ?? s;
const stageColor = (s: string) =>
  s === "won" ? "bg-ink text-white"
  : s === "lost" ? "bg-paper-2 text-muted-2"
  : ["replied", "call_booked", "proposal"].includes(s) ? "bg-coral text-white"
  : s === "not_now" ? "bg-mint text-ink"
  : "bg-paper-2 text-ink";

export function EmployerPipeline({ prospects, due, counts }:
  { prospects: P[]; due: P[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"due" | "all" | "quarterly">("due");
  const [adding, setAdding] = useState(false);
  const [compose, setCompose] = useState<P | null>(null);
  const [tplKey, setTplKey] = useState("hr_lead");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [f, setF] = useState({
    company: "", sector: "", city: "", tier: "1", contact_name: "",
    contact_role: "", contact_email: "", linkedin_url: "", hires_roles: "", hiring_now: false
  });

  async function post(payload: any, done?: () => void) {
    setBusy(true); setNote(null); setBad(false);
    const res = await fetch("/api/admin/prospects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json();
    setBusy(false);
    if (res.ok) { setNote(j.message ?? "Done."); setTimeout(() => setNote(null), 3000); done?.(); router.refresh(); }
    else { setNote(j.error ?? "Failed."); setBad(true); }
  }

  function openCompose(p: P) {
    const key = suggestTemplate(p);
    setTplKey(key);
    const t = templateByKey(key);
    setSubject(t.subject(p as any));
    setBody(t.body(p as any));
    setCompose(p);
  }
  function changeTemplate(key: string) {
    if (!compose) return;
    setTplKey(key);
    const t = templateByKey(key);
    setSubject(t.subject(compose as any));
    setBody(t.body(compose as any));
  }

  const list = tab === "due" ? due
    : tab === "quarterly" ? prospects.filter(p => p.quarterly_list)
    : prospects;

  const exportRows = prospects.map(p => ({
    company: p.company, contact: p.contact_name, role: p.contact_role ?? "",
    email: p.contact_email ?? "", city: p.city ?? "", tier: p.tier,
    hires: p.hires_roles ?? "", hiring_now: p.hiring_now ? "yes" : "no",
    stage: label(p.stage), touches: p.touches,
    next_action: p.next_action ?? "", due: p.next_action_at ?? ""
  }));

  const won = counts["won"] ?? 0;
  const active = prospects.filter(p => !["won", "lost"].includes(p.stage)).length;

  return (
    <div className="space-y-5">
      {note && (
        <div className={`fixed top-6 right-6 z-50 max-w-md px-4 py-3 rounded-card text-sm font-semibold shadow-lg ${
          bad ? "bg-coral text-white" : "bg-ink text-white"}`}>
          {note}{bad && <button className="ml-3 underline opacity-80" onClick={() => setNote(null)}>dismiss</button>}
        </div>
      )}

      {/* headline numbers */}
      <div className="grid sm:grid-cols-4 gap-4">
        {[["Due today", due.length, true], ["In pipeline", active, false],
          ["Quarterly list", prospects.filter(p => p.quarterly_list).length, false],
          ["Won", won, false]].map(([l, v, accent]: any) => (
          <div key={l} className={`card p-4 ${accent && v > 0 ? "border-coral/50" : ""}`}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">{l}</div>
            <div className={`font-display font-semibold text-2xl ${accent && v > 0 ? "text-coral" : ""}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* tabs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {[["due", `Due today (${due.length})`], ["all", `All (${prospects.length})`],
          ["quarterly", "Quarterly list"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-3 h-9 rounded-pill text-xs font-semibold border transition ${
              tab === k ? "bg-ink text-white border-ink" : "border-line hover:border-coral"}`}>{l}</button>
        ))}
        <div className="flex-1" />
        <ExportButton rows={exportRows} filename="employer-pipeline" label="Export" />
        <button className="btn-coral !h-9 text-xs" onClick={() => setAdding(!adding)}>
          {adding ? "Close" : "+ Add company"}
        </button>
      </div>

      {/* add form */}
      {adding && (
        <div className="card p-5">
          <div className="font-display font-semibold mb-3">Add a target company</div>
          <div className="grid sm:grid-cols-4 gap-3 mb-3">
            <input className="input !h-10" placeholder="Company *" value={f.company}
              onChange={e => setF({ ...f, company: e.target.value })} />
            <input className="input !h-10" placeholder="Sector" value={f.sector}
              onChange={e => setF({ ...f, sector: e.target.value })} />
            <input className="input !h-10" placeholder="City" value={f.city}
              onChange={e => setF({ ...f, city: e.target.value })} />
            <select className="input !h-10" value={f.tier} onChange={e => setF({ ...f, tier: e.target.value })}>
              <option value="1">Tier 1 — volume hirer</option>
              <option value="2">Tier 2 — agency</option>
              <option value="3">Tier 3 — SME</option>
              <option value="4">Tier 4 — corporate</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-4 gap-3 mb-3">
            <input className="input !h-10" placeholder="Contact name" value={f.contact_name}
              onChange={e => setF({ ...f, contact_name: e.target.value })} />
            <input className="input !h-10" placeholder="Their role" value={f.contact_role}
              onChange={e => setF({ ...f, contact_role: e.target.value })} />
            <input className="input !h-10" placeholder="Email (never info@)" value={f.contact_email}
              onChange={e => setF({ ...f, contact_email: e.target.value })} />
            <input className="input !h-10" placeholder="Roles they hire" value={f.hires_roles}
              onChange={e => setF({ ...f, hires_roles: e.target.value })} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={f.hiring_now}
                onChange={e => setF({ ...f, hiring_now: e.target.checked })} />
              Hiring right now
            </label>
            <span className="text-xs text-muted-2">Decides which template the system suggests.</span>
            <div className="flex-1" />
            <button className="btn-coral !h-10" disabled={busy}
              onClick={() => post({ action: "create", data: f }, () => {
                setF({ company: "", sector: "", city: "", tier: "1", contact_name: "",
                       contact_role: "", contact_email: "", linkedin_url: "", hires_roles: "", hiring_now: false });
                setAdding(false);
              })}>Add to pipeline</button>
          </div>
        </div>
      )}

      {/* list */}
      <div className="space-y-2">
        {list.length === 0 && (
          <div className="card p-10 text-center text-sm text-muted">
            {tab === "due" ? "Nothing due today. Add companies or come back tomorrow." : "Nothing here yet."}
          </div>
        )}
        {list.map(p => {
          const overdue = p.next_action_at && p.next_action_at < new Date().toISOString().slice(0, 10);
          return (
            <div key={p.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`px-2.5 py-1 rounded-pill text-[10px] font-bold uppercase tracking-wider ${stageColor(p.stage)}`}>
                  {label(p.stage)}
                </span>
                <div className="flex-1 min-w-48">
                  <div className="font-semibold text-sm">
                    {p.company}
                    {p.hiring_now && <span className="ml-2 text-[10px] font-bold uppercase text-coral">hiring now</span>}
                  </div>
                  <div className="text-xs text-muted-2 truncate">
                    {[p.contact_name, p.contact_role, p.city].filter(Boolean).join(" · ") || "no contact yet"}
                    {p.hires_roles && ` — hires ${p.hires_roles}`}
                  </div>
                </div>
                {p.next_action && (
                  <div className="text-right min-w-40">
                    <div className={`text-xs font-semibold ${overdue ? "text-coral" : "text-ink"}`}>{p.next_action}</div>
                    <div className="text-[10px] text-muted-2">
                      {p.next_action_at}{p.touches > 0 && ` · ${p.touches} touch${p.touches === 1 ? "" : "es"}`}
                    </div>
                  </div>
                )}
                <select className="input !h-9 !w-auto text-xs" value={p.stage} disabled={busy}
                  onChange={e => post({ action: "update", id: p.id, data: { stage: e.target.value } })}>
                  {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {p.contact_email && !["won", "lost"].includes(p.stage) && (
                  <button className="btn-coral !h-9 text-xs" onClick={() => openCompose(p)}>Write</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* compose */}
      {compose && (
        <div className="fixed inset-0 bg-ink/50 grid place-items-center z-50 p-4" onClick={() => !busy && setCompose(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
            onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-display font-semibold text-lg">Write to {compose.company}</h3>
              <p className="text-sm text-muted-2">{compose.contact_name} · {compose.contact_email}</p>
            </div>

            <div>
              <label className="label !text-xs">Template</label>
              <select className="input !h-10" value={tplKey} onChange={e => changeTemplate(e.target.value)}>
                {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <p className="text-xs text-muted-2 mt-1">{templateByKey(tplKey).when}</p>
            </div>

            <div>
              <label className="label !text-xs">Subject</label>
              <input className="input !h-10" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div>
              <label className="label !text-xs">Body</label>
              <textarea className="input !h-auto py-2 font-mono text-xs" rows={16}
                value={body} onChange={e => setBody(e.target.value)} />
              {body.includes("[ADD ONE SPECIFIC OBSERVATION") && (
                <p className="text-xs text-coral font-semibold mt-1.5">
                  Replace the bracketed line with something specific about this company — it is the biggest driver of replies.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button className="btn-coral" disabled={busy || body.includes("[ADD ONE SPECIFIC OBSERVATION")}
                onClick={() => post({ action: "send", id: compose.id, data: { subject, body, template_key: tplKey } },
                  () => setCompose(null))}>
                {busy ? "Sending…" : "Send"}
              </button>
              <button className="btn-ghost" onClick={() => setCompose(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
