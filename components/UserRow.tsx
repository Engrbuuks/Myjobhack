"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteButton } from "@/components/DeleteButton";

const ROLES = ["job_seeker", "elite_member", "employer", "recruiter", "trainer", "partner", "admin"];

export function UserRow({ u, isSelf }: {
  u: { id: string; full_name: string; email: string; role: string; created_at: string };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setRole(role: string) {
    setBusy(true); setErr(null);
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_role", id: u.id, data: { role } })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    router.refresh();
  }

  return (
    <div className="card p-4 flex flex-wrap items-center gap-4">
      <span className="w-10 h-10 rounded-full bg-ink text-white grid place-items-center font-display font-semibold shrink-0">
        {(u.full_name || u.email || "?")[0]?.toUpperCase()}
      </span>
      <div className="flex-1 min-w-52">
        <div className="font-semibold text-sm">{u.full_name || "—"} {isSelf && <span className="text-coral text-xs">(you)</span>}</div>
        <div className="text-xs text-muted-2">{u.email} · joined {new Date(u.created_at).toLocaleDateString()}</div>
      </div>
      <select className="input !h-10 !w-auto text-sm" value={u.role} disabled={busy || isSelf}
        onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
      </select>
      {!isSelf && u.role !== "admin" && (
        <DeleteButton action="delete_user" id={u.id} label="Delete" confirmLabel="Permanently delete" small />
      )}
      {err && <span className="text-coral text-xs w-full">{err}</span>}
    </div>
  );
}
