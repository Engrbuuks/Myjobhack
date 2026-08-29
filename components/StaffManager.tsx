"use client";
import { useState, useEffect } from "react";
import { callApi, postJson } from "@/lib/apiClient";
import { CAPABILITY_GROUPS, CAPABILITIES, PRESETS, presetFor, type Capability } from "@/lib/permissions";

const ROLES = [
  { id: "admin", label: "Admin — full staff portal" },
  { id: "recruiter", label: "Recruiter — staff portal, hiring focus" },
  { id: "trainer", label: "Trainer — runs trainings only" },
  { id: "partner", label: "Partner — referrals and payouts" }
];

export function StaffManager() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("recruiter");
  const [preset, setPreset] = useState("recruiter");
  const [custom, setCustom] = useState<Capability[]>([]);
  const [useCustom, setUseCustom] = useState(false);
  const [setPassword, setSetPassword] = useState(false);
  const [password, setPassword_] = useState("");
  const [accessNote, setAccessNote] = useState("");

  async function load() {
    const r = await callApi("/api/admin/staff");
    if (r.ok) { setData(r.data); setErr(null); } else setErr(r.error);
  }
  useEffect(() => { load(); }, []);

  const isStaffRole = ["admin", "recruiter"].includes(role);
  const effectiveCaps: Capability[] | null = !isStaffRole ? null
    : useCustom ? custom
    : (PRESETS.find((p) => p.id === preset)?.caps as Capability[] | null);

  async function create() {
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await postJson("/api/admin/staff", {
        email, full_name: name, role,
        ...(isStaffRole ? (useCustom ? { permissions: custom } : { preset }) : {}),
        ...(setPassword ? { password } : {}),
        access_note: accessNote
      });
      if (r.ok) {
        setNote(r.data?.message ?? "Created.");
        setEmail(""); setName(""); setPassword_(""); setAccessNote(""); setOpen(false);
      } else setErr(r.error);
    } finally { setBusy(false); }
    load();
  }

  async function patch(id: string, body: any) {
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await callApi("/api/admin/staff", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body })
      });
      if (r.ok) { setNote(r.data?.message ?? "Updated."); setEditing(null); } else setErr(r.error);
    } finally { setBusy(false); }
    load();
  }

  async function remove(id: string, who: string) {
    if (!confirm(`Remove ${who}? Their account and access are deleted permanently.`)) return;
    setBusy(true); setErr(null);
    try {
      const r = await callApi(`/api/admin/staff?id=${id}`, { method: "DELETE" });
      if (r.ok) setNote(r.data?.message ?? "Removed."); else setErr(r.error);
    } finally { setBusy(false); }
    load();
  }

  const staff = data?.staff ?? [];

  return (
    <div className="space-y-4">
      {err && (
        <div className="card p-4 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink mb-1">That didn&rsquo;t work</div>
          <p className="text-sm text-muted">{err}</p>
        </div>
      )}
      {note && <p className="text-sm font-medium text-ink">{note}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-coral" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "＋ Add a team member"}
        </button>
        <p className="text-sm text-muted-2">
          {staff.length} staff account{staff.length === 1 ? "" : "s"}
        </p>
      </div>

      {open && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label !text-xs">Full name</label>
              <input className="input !h-10" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Rita Adewale" />
            </div>
            <div>
              <label className="label !text-xs">Email</label>
              <input className="input !h-10" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="rita@myjobhack.co" />
            </div>
          </div>

          <div>
            <label className="label !text-xs">Role — decides which portal they land in</label>
            <select className="input !h-10" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          {isStaffRole && (
            <div>
              <label className="label !text-xs">Access level — decides what they can do inside it</label>
              <select className="input !h-10" value={useCustom ? "custom" : preset}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setUseCustom(true);
                    setCustom((PRESETS.find((p) => p.id === preset)?.caps ?? []) as Capability[]);
                  } else { setUseCustom(false); setPreset(e.target.value); }
                }}>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="custom">Choose individually…</option>
              </select>
              {!useCustom && (
                <p className="text-xs text-muted-2 mt-1.5">
                  {PRESETS.find((p) => p.id === preset)?.description}
                </p>
              )}

              {useCustom && (
                <div className="mt-3 space-y-3 rounded-xl border border-line p-4">
                  {CAPABILITY_GROUPS.map((g) => (
                    <div key={g.label}>
                      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1.5">{g.label}</div>
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {g.caps.map((c) => (
                          <label key={c} className="flex items-start gap-2 text-sm">
                            <input type="checkbox" className="accent-[#FC5647] w-4 h-4 mt-0.5"
                              checked={custom.includes(c)}
                              onChange={(e) => setCustom(e.target.checked
                                ? [...custom, c] : custom.filter((x) => x !== c))} />
                            <span className="text-muted">{CAPABILITIES[c]}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label !text-xs">Note — why they have this access (optional)</label>
            <input className="input !h-10" value={accessNote} onChange={(e) => setAccessNote(e.target.value)}
              placeholder="Handles Lagos call-centre hiring" />
          </div>

          <div className="rounded-xl border border-line p-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="accent-[#FC5647] w-4 h-4 mt-0.5"
                checked={setPassword} onChange={(e) => setSetPassword(e.target.checked)} />
              <span>
                <span className="font-medium text-ink">Set a password instead of sending an invitation</span>
                <span className="block text-xs text-muted-2 mt-0.5">
                  By default they get an email and choose their own password, so no secret passes
                  through you. Only set one directly if their email isn&rsquo;t working.
                </span>
              </span>
            </label>
            {setPassword && (
              <input className="input !h-10 mt-3" type="text" value={password}
                onChange={(e) => setPassword_(e.target.value)}
                placeholder="At least 10 characters" />
            )}
          </div>

          <button className="btn-coral" onClick={create}
            disabled={busy || !email.trim() || !name.trim() || (setPassword && password.length < 10)}>
            {busy ? "Creating…" : setPassword ? "Create account" : "Send invitation"}
          </button>
        </div>
      )}

      {/* Existing staff */}
      <div className="space-y-2">
        {staff.map((u: any) => {
          const p = presetFor(u.permissions);
          const isMe = u.id === data?.me?.id;
          return (
            <div key={u.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.full_name || "Unnamed"}</span>
                    {isMe && <span className="rounded-pill bg-paper-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-2">you</span>}
                    <span className="rounded-pill bg-ink text-white px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      {u.role.replace(/_/g, " ")}
                    </span>
                    <span className={`rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      u.permissions == null ? "bg-coral text-white" : "bg-coral-soft text-coral"}`}>
                      {u.permissions == null ? "full access" : (PRESETS.find((x) => x.id === p)?.label ?? "custom")}
                    </span>
                    {u.invited_at && !u.full_name && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-2">invite pending</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-2 mt-1">{u.email}</div>
                  {u.access_note && <div className="text-xs text-muted-2 mt-1 italic">{u.access_note}</div>}
                  {u.permissions && (
                    <div className="text-xs text-muted-2 mt-1.5">
                      {u.permissions.length} of {Object.keys(CAPABILITIES).length} capabilities
                    </div>
                  )}
                </div>

                {!isMe && (
                  <div className="flex gap-2 shrink-0">
                    <button className="btn-ghost !h-9 text-xs"
                      onClick={() => setEditing(editing === u.id ? null : u.id)}>
                      {editing === u.id ? "Close" : "Change access"}
                    </button>
                    <button className="btn-ghost !h-9 text-xs"
                      onClick={() => remove(u.id, u.full_name || u.email)} disabled={busy}>
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {editing === u.id && (
                <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label !text-xs">Role</label>
                    <select className="input !h-10 !w-auto text-sm" defaultValue={u.role}
                      onChange={(e) => patch(u.id, { role: e.target.value })}>
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label !text-xs">Access level</label>
                    <select className="input !h-10 !w-auto text-sm" defaultValue={p}
                      onChange={(e) => patch(u.id, { preset: e.target.value })}>
                      {PRESETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Audit */}
      {data?.log?.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-sm">Recent access changes</summary>
          <div className="mt-3 space-y-1.5">
            {data.log.map((l: any) => (
              <div key={l.id} className="text-xs text-muted-2 flex gap-3">
                <span className="shrink-0">{new Date(l.created_at).toLocaleString()}</span>
                <span className="font-medium text-ink">{l.action.replace(/_/g, " ")}</span>
                <span className="truncate">{l.detail?.email ?? l.detail?.who ?? ""}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
