"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Two-step destructive action: click → confirm → done. */
export function DeleteButton({ action, id, label = "Delete", confirmLabel = "Confirm delete", redirect, small }: {
  action: string; id: string; label?: string; confirmLabel?: string; redirect?: string; small?: boolean;
}) {
  const router = useRouter();
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/admin/manage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); setArm(false); return; }
    if (json.note) alert(json.note);
    if (redirect) router.push(redirect); else router.refresh();
  }

  const base = small ? "text-xs font-semibold" : "text-sm font-semibold";
  return (
    <span className="inline-flex items-center gap-2">
      {!arm ? (
        <button type="button" className={`${base} text-muted hover:text-coral transition`} onClick={() => setArm(true)}>
          {label}
        </button>
      ) : (
        <>
          <button type="button" disabled={busy}
            className={`${base} px-3 py-1.5 rounded-pill bg-coral text-white`} onClick={run}>
            {busy ? "…" : confirmLabel}
          </button>
          <button type="button" className={`${base} text-muted`} onClick={() => setArm(false)}>Keep</button>
        </>
      )}
      {err && <span className="text-coral text-xs max-w-xs">{err}</span>}
    </span>
  );
}
