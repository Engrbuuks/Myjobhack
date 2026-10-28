"use client";
import { useEffect, useState } from "react";
import { callApi, postJson } from "@/lib/apiClient";

export type RoomPick = { kind: "jitsi" | "meet" | "manual"; interviewer_id?: string };

/**
 * Where a video interview happens.
 *
 *   Our interview room   a private room per interview on our own server, with
 *                        no sign in for anyone. Only offered once switched on.
 *   Google Meet          a saved Meet room. Candidates share it and ask to
 *                        join, so the interviewer admits one at a time.
 *   Paste a link         anything else, as before.
 *
 * Saving your own Meet link happens here, where it is needed, rather than on
 * a settings page an employer or recruiter may not be able to open.
 */
export function VideoRoomPicker({ value, onChange }: {
  value: RoomPick; onChange: (v: RoomPick) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [jitsiOn, setJitsiOn] = useState(false);
  const [links, setLinks] = useState<{ id: string; url: string; name: string }[]>([]);
  const [me, setMe] = useState<string>("");
  const [myMeet, setMyMeet] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await callApi("/api/interview-rooms");
      if (r.ok) {
        setJitsiOn(!!r.data.jitsi?.active);
        setLinks(r.data.meet_links ?? []);
        setMe(r.data.me);
        setMyMeet(r.data.my_meet);
        // Start from the team's default, unless the form already chose.
        if (value.kind === "manual" && r.data.default_kind !== "manual")
          onChange({ kind: r.data.default_kind });
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveMine() {
    setBusy(true); setErr(null);
    try {
      const r = await postJson("/api/interview-rooms", { action: "save_meet", url: draft });
      if (!r.ok) { setErr(r.error); return; }
      setMyMeet(r.data.my_meet);
      setLinks((ls) => [...ls.filter((l) => l.id !== me), { id: me, url: r.data.my_meet, name: "You" }]);
      setDraft("");
      onChange({ kind: "meet" });
    } finally { setBusy(false); }
  }

  const others = links.filter((l) => l.id !== me);
  const encoded = value.kind === "meet" && value.interviewer_id && value.interviewer_id !== me
    ? `meet:${value.interviewer_id}` : value.kind;

  function pick(v: string) {
    if (v.startsWith("meet:")) return onChange({ kind: "meet", interviewer_id: v.slice(5) });
    onChange({ kind: v as RoomPick["kind"] });
  }

  const needsMyLink = value.kind === "meet" && (!value.interviewer_id || value.interviewer_id === me) && !myMeet;

  return (
    <div>
      <label className="label">Video room</label>
      <select className="input !h-10 text-sm" value={encoded} onChange={(e) => pick(e.target.value)} disabled={!loaded}>
        {jitsiOn && <option value="jitsi">Our interview room: private, no sign in</option>}
        <option value="meet">{myMeet ? "Google Meet: my room" : "Google Meet: save my room first"}</option>
        {others.map((l) => (
          <option key={l.id} value={`meet:${l.id}`}>Google Meet: {l.name || "another interviewer"}</option>
        ))}
        <option value="manual">Paste a link</option>
      </select>

      {needsMyLink && (
        <div className="mt-2 rounded-xl border border-line p-3 bg-white">
          <p className="text-xs text-muted-2 mb-2">
            Open Google Meet, choose <strong>New meeting</strong> then <strong>Create a meeting for later</strong>,
            and paste the link here. It is saved for every interview you send, and stays valid as long as it is used
            at least once a year.
          </p>
          <div className="flex gap-2">
            <input className="input !h-9 flex-1 text-sm" placeholder="https://meet.google.com/abc-defg-hij"
              value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button type="button" className="btn-coral !h-9 text-xs" disabled={busy || !draft.trim()} onClick={saveMine}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-2 mt-1">
        {value.kind === "jitsi"
          ? "Each candidate gets a private link that opens 15 minutes before their time. You join from the interview desk."
          : value.kind === "meet"
            ? "Candidates ask to join and wait. Admit one at a time, after the previous person has left. Never add candidates to a Calendar invite for this room."
            : "Paste the meeting link below."}
        {value.kind === "meet" && myMeet && (!value.interviewer_id || value.interviewer_id === me) && (
          <> <button type="button" className="underline hover:text-coral" onClick={() => setMyMeet(null)}>Change my link</button></>
        )}
      </p>
      {err && <p className="text-xs text-coral mt-1">{err}</p>}
    </div>
  );
}
