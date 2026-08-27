"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; name: string; email: string; status: string; enrolled: string; attended: string; completed: string };
const STATUSES = ["invited", "registered", "attended", "completed", "dropped"];

export function LearnerTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    await fetch("/api/lms/enrollment-status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_id: id, status })
    });
    setBusy(null); router.refresh();
  }

  if (rows.length === 0)
    return <div className="card p-10 text-center text-sm text-muted">No one enrolled yet.</div>;

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="card p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-48">
            <div className="font-semibold text-sm">{r.name}</div>
            <div className="text-xs text-muted-2">{r.email} · enrolled {r.enrolled}</div>
          </div>
          {r.completed === "yes" && (
            <span className="px-2 py-0.5 rounded-pill bg-ink text-white text-[10px] font-bold uppercase">Completed</span>
          )}
          <select className="input !h-10 !w-auto text-sm capitalize" value={r.status} disabled={busy === r.id}
            onChange={(e) => setStatus(r.id, e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
