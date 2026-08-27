"use client";
import { useState } from "react";

export function RequestCredentialsButton({ profileId, compact }: { profileId: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function request() {
    setState("sending");
    const res = await fetch("/api/admin/request-credentials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_ids: [profileId] })
    });
    const json = await res.json();
    setState(res.ok && json.sent > 0 ? "sent" : "error");
  }

  if (state === "sent") return <span className="text-xs font-semibold text-green-600">✓ Emailed</span>;
  if (state === "error") return <button onClick={request} className="text-xs font-semibold text-coral">Retry</button>;

  return (
    <button onClick={request} disabled={state === "sending"}
      className={compact
        ? "text-xs font-semibold text-muted hover:text-ink transition disabled:opacity-50"
        : "btn-ghost !h-9 text-xs disabled:opacity-50"}
      title="Email this person a request to upload their credentials">
      {state === "sending" ? "Sending…" : "Request credentials"}
    </button>
  );
}
