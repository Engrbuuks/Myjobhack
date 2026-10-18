"use client";
import { useState } from "react";
import { postJson, callApi } from "@/lib/apiClient";

type Props = {
  publicUrl: string | null;
  enabled: boolean;
  headline: string | null;
  institution: string | null;
  verifyCode: string | null;
  credits: number;
};

/**
 * Everything a member can take off the platform, in one place: the public
 * page, the verification code, the letter, and invitations.
 *
 * The public page is OFF until the member turns it on here. A verified
 * credential is theirs to publish, and the switch says plainly what happens
 * either way rather than hiding behind a toggle with no consequence stated.
 */
export function EliteProof(props: Props) {
  const [enabled, setEnabled] = useState(props.enabled);
  const [headline, setHeadline] = useState(props.headline ?? "");
  const [institution, setInstitution] = useState(props.institution ?? "");
  const [url, setUrl] = useState(props.publicUrl);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  async function save(next: Partial<{ enabled: boolean; headline: string; institution: string }>) {
    setBusy(true); setErr(null); setNote(null);
    const res = await postJson("/api/elite/public-profile", next);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setNote(res.data.message);
    setUrl(res.data.url ?? null);
    setEnabled(!!res.data.public_profile);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and in private windows.
      // The address is on screen and selectable, so this needs no fallback
      // beyond not pretending it worked.
      setErr("Your browser would not let the page copy that. Select the address and copy it yourself.");
    }
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true); setInviteNote(null); setInviteLink(null);
    const res = await postJson("/api/elite/referral", { email: inviteEmail });
    setInviteBusy(false);
    if (!res.ok) { setInviteNote(res.error); return; }
    setInviteLink(res.data.link ?? null);
    setInviteNote(res.data.message);
    setInviteEmail("");
  }

  async function downloadLetter() {
    setErr(null);
    // Checked rather than assumed: a 403 here would otherwise download an
    // HTML error page named like a PDF.
    const probe = await callApi("/api/elite/credential", { method: "GET" });
    if (!probe.ok && probe.status !== 200) { setErr(probe.error ?? "Could not produce the letter."); return; }
    window.location.href = "/api/elite/credential";
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">

      {/* ---------------- the public page ---------------- */}
      <div className="card p-6">
        <h3 className="font-display font-semibold text-lg">Your public page</h3>
        <p className="text-sm text-muted-2 mt-1 mb-5">
          One link that proves your credential to anyone, with no account needed at their end. Off until you
          turn it on.
        </p>

        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <input type="checkbox" className="mt-1 accent-[#FC5647] w-4 h-4" checked={enabled} disabled={busy}
            onChange={(e) => { setEnabled(e.target.checked); save({ enabled: e.target.checked }); }} />
          <span className="text-sm">
            <b>{enabled ? "Live" : "Off"}.</b>{" "}
            {enabled
              ? "Anyone with the link can see your name, distinction, institution, chapter and member number. Never your email, phone or CV."
              : "The link returns nothing. Turn it on when you want to share your credential."}
          </span>
        </label>

        {enabled && url && (
          <div className="rounded-xl border border-line bg-paper-2 p-4 mb-5">
            <div className="text-[10px] font-extrabold uppercase tracking-[.16em] text-muted mb-2">Your address</div>
            <div className="flex flex-wrap items-center gap-3">
              <code className="text-sm font-semibold break-all">{url}</code>
              <button className="btn-ghost !h-9 text-xs" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="ph" className="label !text-xs">One line about you, shown on the page</label>
            <input id="ph" className="input !h-11" maxLength={120} value={headline}
              placeholder="Audit associate, moving into financial planning"
              onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pi" className="label !text-xs">Institution, if your credential record is incomplete</label>
            <input id="pi" className="input !h-11" maxLength={120} value={institution}
              placeholder="University of Ibadan"
              onChange={(e) => setInstitution(e.target.value)} />
            <p className="text-xs text-muted-2 mt-1.5">
              Where a verified credential exists, that is what shows. This line is only a fallback.
            </p>
          </div>
          <button className="btn-coral !h-10 text-sm" disabled={busy}
            onClick={() => save({ headline, institution })}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ---------------- the letter and the code ---------------- */}
      <div className="flex flex-col gap-6">
        <div className="card p-6">
          <h3 className="font-display font-semibold text-lg">Credential letter</h3>
          <p className="text-sm text-muted-2 mt-1 mb-5">
            A one page statement you can attach to any application, anywhere. It carries your verification code,
            and whoever receives it checks the live record rather than taking the file&rsquo;s word for it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-coral !h-10 text-sm" onClick={downloadLetter}>Download the letter</button>
            {props.verifyCode && (
              <span className="text-sm">
                <span className="text-muted-2">Your code </span>
                <code className="font-bold tracking-[.14em]">{props.verifyCode}</code>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-2 mt-4 pt-4 border-t border-line leading-relaxed">
            The letter is not digitally signed and does not claim to be. Anyone relying on it should run the check
            at <b>/verify</b>, which is the only thing that proves anything.
          </p>
        </div>

        <div className="card p-6">
          <h3 className="font-display font-semibold text-lg">Bring someone in</h3>
          <p className="text-sm text-muted-2 mt-1 mb-5">
            Send your link to someone whose credential would stand up. You are credited when they are verified,
            not when they sign up. Standing is recognition in the room, not a payment.
          </p>
          <div className="flex flex-wrap gap-3">
            <input className="input !h-11 flex-1 min-w-48" type="email" value={inviteEmail}
              placeholder="their@email.com"
              onChange={(e) => setInviteEmail(e.target.value)} />
            <button className="btn-ghost !h-11" disabled={inviteBusy || !inviteEmail.trim()} onClick={invite}>
              {inviteBusy ? "…" : "Get the link"}
            </button>
          </div>
          {inviteLink && (
            <div className="rounded-xl border border-line bg-paper-2 p-4 mt-4">
              <code className="text-xs break-all">{inviteLink}</code>
            </div>
          )}
          {inviteNote && <p className="text-xs text-muted mt-3">{inviteNote}</p>}
          <div className="text-sm mt-4 pt-4 border-t border-line">
            <span className="text-muted-2">Members you have brought in: </span>
            <b>{props.credits}</b>
          </div>
        </div>
      </div>

      {note && <p className="text-sm font-semibold text-ink lg:col-span-2">{note}</p>}
      {err && <p className="text-sm font-semibold text-coral lg:col-span-2">{err}</p>}
    </div>
  );
}
