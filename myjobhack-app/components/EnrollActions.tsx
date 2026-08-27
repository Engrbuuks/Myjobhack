"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AcceptInviteButton({ trainingId }: { trainingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function accept() {
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("enrollments")
      .insert({ training_id: trainingId, talent_id: user!.id, status: "registered" });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) { setErr(error.message); return; }
    router.refresh();
  }
  return (
    <span>
      <button className="btn-coral !h-10" onClick={accept} disabled={busy}>
        {busy ? "…" : "Accept & register →"}
      </button>
      {err && <span className="text-coral text-xs ml-3">{err}</span>}
    </span>
  );
}
