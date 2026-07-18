"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function FunnelToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("app_settings").update({ value: { enabled: !enabled } }).eq("key", "funnel");
    setBusy(false); router.refresh();
  }
  return (
    <button onClick={toggle} disabled={busy}
      className={`px-4 h-10 rounded-pill text-sm font-bold transition ${
        enabled ? "bg-ink text-white" : "border border-line text-muted"}`}>
      {enabled ? "● Drips ON" : "○ Drips paused"}
    </button>
  );
}
