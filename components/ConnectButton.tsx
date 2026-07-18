"use client";
import { useState } from "react";

export function ConnectButton({ recipientId, compact }: { recipientId: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "exists">("idle");
  async function connect() {
    setState("busy");
    const res = await fetch("/api/elite/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", recipient_id: recipientId })
    });
    const json = await res.json();
    setState(res.ok ? (json.already ? "exists" : "sent") : "idle");
  }
  const label = state === "sent" ? "Requested ✓" : state === "exists" ? "Connected" : state === "busy" ? "…" : compact ? "✦ Connect" : "✦ Request to connect";
  return (
    <button onClick={connect} disabled={state !== "idle"}
      className={compact
        ? "px-3 h-8 rounded-pill border border-white/25 text-[11px] font-bold text-white/80 hover:border-coral hover:text-coral transition shrink-0"
        : "btn-ghost !h-10 text-sm"}>
      {label}
    </button>
  );
}
