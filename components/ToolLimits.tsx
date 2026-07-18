"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TOOLS = [
  ["resume-review", "Resume Review"],
  ["interview-prep", "Interview Preparer"],
  ["skills-gap", "Skills Gap Analysis"]
] as const;

export function ToolLimits({ limits }: { limits: Record<string, number> }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(TOOLS.map(([k]) => [k, String(limits[k] ?? 0)]))
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true); setNote(null);
    const supabase = createClient();
    const value = Object.fromEntries(TOOLS.map(([k]) => [k, Math.max(0, Number(vals[k]) || 0)]));
    await supabase.from("app_settings").update({ value }).eq("key", "toolkit_limits");
    setBusy(false); setNote("Saved ✓ — live immediately, no deploy."); router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1">Toolkit daily allowances</div>
      <p className="text-xs text-muted-2 mb-4">Per member, per day. Resets midnight WAT. Set 0 to pause a tool.</p>
      <div className="space-y-3 max-w-sm">
        {TOOLS.map(([k, label]) => (
          <div key={k} className="flex items-center gap-3">
            <span className="flex-1 text-sm font-medium">{label}</span>
            <input className="input !h-10 !w-20 text-center" type="number" min={0}
              value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} />
            <span className="text-xs text-muted-2 w-10">/day</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button className="btn-coral !h-10" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save allowances"}</button>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
    </div>
  );
}
