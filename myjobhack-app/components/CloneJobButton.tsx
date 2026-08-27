"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloneJobButton({ jobId, basePath = "/portal/admin/jobs" }: { jobId: string; basePath?: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function clone() {
    setBusy(true);
    const res = await fetch("/api/jobs/clone", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { alert(json.error ?? "Could not duplicate this role."); return; }
    router.push(`${basePath}/${json.id}`);
  }

  return (
    <button onClick={clone} disabled={busy} className="text-muted font-semibold hover:text-ink transition disabled:opacity-50"
      title="Create an editable copy of this role">
      {busy ? "Copying…" : "Duplicate"}
    </button>
  );
}
