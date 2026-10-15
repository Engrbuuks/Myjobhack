"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/apiClient";

/**
 * Accept a training invitation.
 *
 * This used to insert the enrollments row from the browser. The policy that
 * allowed it could not tell a free training from a paid one, so it also let
 * anyone enrol themselves in a paid course for nothing. Registration now goes
 * through /api/trainings/enroll, which reads the price from the database and
 * refuses a paid training.
 */
export function AcceptInviteButton({ trainingId }: { trainingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true); setErr(null);
    const r = await postJson<{ ok?: boolean; paid?: boolean }>(
      "/api/trainings/enroll", { training_id: trainingId }
    );
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
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
