"use client";
import { useEffect, useState } from "react";
import { callApi, postJson } from "@/lib/apiClient";

/**
 * Video rooms for interviews: the team default, and the switch for our own
 * Jitsi server.
 *
 * Switching our own room on is deliberately two steps. The server settings
 * live in Vercel (so the signing secret never sits in the database), and an
 * admin then checks the server answers and turns it on here. Until both, the
 * option does not appear in any scheduler.
 */
export function InterviewRoomSettings() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  async function load() {
    const r = await callApi("/api/interview-rooms");
    if (r.ok) setData(r.data);
    else setNote({ text: r.error ?? "Could not load.", bad: true });
  }
  useEffect(() => { load(); }, []);

  async function act(body: any) {
    setBusy(true); setNote(null);
    try {
      const r = await postJson("/api/interview-rooms", body);
      if (!r.ok) setNote({ text: r.error ?? "That did not work.", bad: true });
      else {
        if (r.data?.message) setNote({ text: r.data.message, bad: r.data.ok === false });
        else setNote({ text: "Saved." });
        await load();
      }
    } finally { setBusy(false); }
  }

  if (!data) return <div className="card p-5 mb-5 text-sm text-muted">{note?.text ?? "Loading video room settings…"}</div>;
  const j = data.jitsi ?? {};

  return (
    <div className="card p-5 mb-5">
      <div className="font-display font-semibold mb-1">Video rooms</div>
      <p className="text-sm text-muted-2 mb-4">
        Where video interviews happen unless the scheduler picks otherwise. Each person saves their
        own Google Meet link from the scheduler, the first time they use it.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label !text-xs">Default for new video interviews</label>
          <select className="input !h-10 text-sm" value={data.default_kind} disabled={busy}
            onChange={(e) => act({ action: "settings", default_kind: e.target.value })}>
            <option value="meet">Google Meet (each interviewer&rsquo;s saved room)</option>
            <option value="jitsi" disabled={!j.active}>Our interview room{j.active ? "" : " (switch on first)"}</option>
            <option value="manual">Paste a link each time</option>
          </select>
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="text-sm font-semibold mb-1">
            Our interview room{" "}
            <span className={`rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              j.active ? "bg-ink text-white" : "bg-paper-2 text-muted-2"}`}>
              {j.active ? "on" : j.configured ? "ready, off" : "not set up"}
            </span>
          </div>
          {!j.configured ? (
            <p className="text-xs text-muted-2">
              Set up the server with the guide in <code>ops/jitsi/README.md</code>, then add these in Vercel
              and redeploy: <strong>{(j.missing ?? []).join(", ")}</strong>.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-2 mb-2">Server: <strong className="text-ink">{j.domain}</strong></p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost !h-8 text-xs" disabled={busy}
                  onClick={() => act({ action: "check_server" })}>Check the server</button>
                <button className={`${j.enabled ? "btn-ghost" : "btn-coral"} !h-8 text-xs`} disabled={busy}
                  onClick={() => act({ action: "settings", jitsi_enabled: !j.enabled })}>
                  {j.enabled ? "Switch off" : "Switch on"}
                </button>
              </div>
              <p className="text-xs text-muted-2 mt-2">
                Switching off only stops new interviews using it. Links already sent keep working.
              </p>
            </>
          )}
        </div>
      </div>

      {note && <p className={`text-sm font-semibold mt-3 ${note.bad ? "text-coral" : "text-ink"}`}>{note.text}</p>}
    </div>
  );
}
