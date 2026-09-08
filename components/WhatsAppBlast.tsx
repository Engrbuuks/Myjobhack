"use client";
import { useState, useEffect, useRef } from "react";
import {
  waLink, forWhatsApp, whyNotReachable, detectTarget,
  TARGET_LABELS, TARGET_HELP, RESUMPTION_TEMPLATE, REMINDER_TEMPLATE, WA_WEB_HOME,
  waLinkSaved, savedVariant, type WaTarget
} from "@/lib/whatsapp";
import { renderApplicantTemplate, applicantVars, APPLICANT_TOKENS } from "@/lib/applicantEmail";
import { WhatsAppTester } from "@/components/WhatsAppTester";

type Row = {
  id: string; name: string; phone?: string | null; email: string;
  applied_location?: string | null; status: string;
};

/**
 * Work through a list of candidates on WhatsApp, one at a time.
 *
 * WHY A QUEUE RATHER THAN A LIST OF LINKS: a link per candidate opens a tab
 * per candidate. With web.whatsapp.com each of those tabs boots the whole
 * application before it can show the chat, which is the dark screen people
 * see, and thirty seven of them is unusable. So this sends to one person at a
 * time, into a SINGLE reused window, and advances when you confirm.
 *
 * The desktop protocol handler avoids the browser entirely and is the default
 * on a computer. Copy and paste sits underneath throughout, because a handler
 * that is not registered fails silently and the work still has to get done.
 */
export function WhatsAppBlast({ rows, jobTitle, senderName, onClose }: {
  rows: Row[]; jobTitle: string; senderName: string; onClose?: () => void;
}) {
  const [template, setTemplate] = useState(RESUMPTION_TEMPLATE);
  const [detail, setDetail] = useState("");
  const [target, setTarget] = useState<WaTarget>("app");
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  /**
   * Whether WhatsApp Web has been opened once to sign in.
   *
   * An unsigned browser shows the QR page instead of the chat, which reads as
   * a broken link rather than a login prompt. Doing it deliberately, once,
   * before the run turns that into a step rather than a mystery.
   */
  const [signedIn, setSignedIn] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [variant, setVariant] = useState<string | null>(null);
  useEffect(() => { setVariant(savedVariant()); }, []);

  /** One window, reused. Never a tab per candidate. */
  const winRef = useRef<Window | null>(null);

  useEffect(() => { setTarget(detectTarget()); }, []);

  const messageFor = (r: Row) => forWhatsApp(renderApplicantTemplate(template, applicantVars({
    name: r.name, role: jobTitle, company: "MYJOBHACK", email: r.email,
    phone: r.phone ?? "", location: r.applied_location ?? "",
    stage: r.status, sender: senderName, detail
  })));

  const reachable = rows.filter((r) => !whyNotReachable(r.phone));
  const unreachable = rows.filter((r) => whyNotReachable(r.phone));
  const current = reachable[index];
  const remaining = reachable.length - sent.size;

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  function openFor(r: Row) {
    // A variant proven by the tester wins over any guess made here.
    const url = variant ? waLinkSaved(r.phone!, messageFor(r)) : waLink(r.phone!, messageFor(r), target);
    if (!url) return;

    if (url.startsWith("whatsapp://")) {
      // A protocol handler needs no window. Assigning location hands off to
      // the operating system, and this page stays where it is.
      window.location.href = url;
      return;
    }

    /**
     * Reuse one named window. Opening with the same name navigates the
     * existing tab instead of creating another, so WhatsApp Web boots once
     * for the whole run rather than once per person.
     */
    if (winRef.current && !winRef.current.closed) {
      winRef.current.location.href = url;
      winRef.current.focus();
    } else {
      winRef.current = window.open(url, "mjh_whatsapp");
    }
  }

  function markAndAdvance() {
    if (!current) return;
    const next = new Set(sent); next.add(current.id);
    setSent(next);
    const upcoming = reachable.findIndex((r, i) => i > index && !next.has(r.id));
    setIndex(upcoming >= 0 ? upcoming : reachable.length);
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg">
            WhatsApp {reachable.length} candidate{reachable.length === 1 ? "" : "s"}
          </h3>
          <p className="text-sm text-muted-2 mt-1">
            One at a time, into a single window. Nothing is sent from here: you press send in
            WhatsApp.
          </p>
        </div>
        {onClose && <button className="text-muted-2 hover:text-ink" onClick={onClose}>&#10005;</button>}
      </div>

      {!started ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost !h-9 text-xs" onClick={() => setTemplate(RESUMPTION_TEMPLATE)}>
              Resumption message
            </button>
            <button className="btn-ghost !h-9 text-xs" onClick={() => setTemplate(REMINDER_TEMPLATE)}>
              Interview reminder
            </button>
          </div>

          <div>
            <label className="label !text-xs">Message</label>
            <textarea className="input !h-auto py-2" rows={7} value={template}
              onChange={(e) => setTemplate(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {APPLICANT_TOKENS.filter((t) => !["{email}", "{stage}"].includes(t.token)).map((t) => (
                <button key={t.token} title={t.means} onClick={() => setTemplate((v) => v + t.token)}
                  className="rounded-pill border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-coral hover:text-coral transition">
                  {t.token}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-2 mt-2">
              WhatsApp is plain text. *Bold* and _italic_ work, nothing else.
            </p>
          </div>

          {template.includes("{detail}") && (
            <div>
              <label className="label !text-xs">
                What {"{detail}"} should say, written once for everyone
              </label>
              <textarea className="input !h-auto py-2" rows={3} value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Resume on Monday 15 September at 8am. 14 Adeshina Street, Ikeja. Ask for Rita at reception." />
            </div>
          )}

          <div className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted">
                {variant ? "Using a tested link" : "Not working? Find the link that does"}
              </span>
              <button className="text-xs text-muted hover:text-ink underline"
                onClick={() => setShowTester((v) => !v)}>
                {showTester ? "Hide the tester" : "Test the links"}
              </button>
            </div>
            {showTester && (
              <div className="mb-4">
                <WhatsAppTester onChosen={(id) => { setVariant(id); setShowTester(false); }} />
              </div>
            )}
            {!variant && <label className="label !text-xs">How should WhatsApp open?</label>}
            {!variant && (
              <>
                <select className="input !h-10 text-sm" value={target}
                  onChange={(e) => setTarget(e.target.value as WaTarget)}>
                  {(Object.keys(TARGET_LABELS) as WaTarget[]).map((k) => (
                    <option key={k} value={k}>{TARGET_LABELS[k]}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-2 mt-2">{TARGET_HELP[target]}</p>
              </>
            )}
          </div>

          {!variant && target === "web" && !signedIn && (
            <div className="rounded-xl border border-coral/40 p-4" style={{ background: "#FFF4F2" }}>
              <div className="text-sm font-semibold text-ink mb-1">Sign in to WhatsApp Web first</div>
              <p className="text-xs text-muted mb-3">
                If this browser is not signed in, every link opens the QR page instead of the
                chat, which looks like a broken link. Open it once, scan the code with your
                phone, then come back. The tab stays open and is reused for every candidate.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={WA_WEB_HOME} target="mjh_whatsapp" rel="noopener"
                  className="btn-coral !h-9 text-sm"
                  onClick={() => { winRef.current = window.open(WA_WEB_HOME, "mjh_whatsapp"); }}>
                  Open WhatsApp Web
                </a>
                <button className="btn-ghost !h-9 text-sm" onClick={() => setSignedIn(true)}>
                  Already signed in, continue
                </button>
              </div>
            </div>
          )}

          <button className="btn-coral"
            disabled={!reachable.length || !template.trim() || (!variant && target === "web" && !signedIn)}
            onClick={() => setStarted(true)}>
            Start with {reachable.length} candidate{reachable.length === 1 ? "" : "s"}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-paper-2 overflow-hidden min-w-32">
              <div className="h-full bg-coral transition-all"
                style={{ width: `${reachable.length ? (sent.size / reachable.length) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-muted-2">
              {sent.size} done, {Math.max(0, remaining)} to go
            </span>
            <button className="text-xs text-muted hover:text-ink underline" onClick={() => setStarted(false)}>
              Edit the message
            </button>
          </div>

          {current ? (
            <div className="rounded-xl border border-line p-4 space-y-3">
              <div>
                <div className="font-display font-semibold text-lg">{current.name}</div>
                <div className="text-sm text-muted-2">{current.phone}</div>
              </div>

              <div className="rounded-lg bg-paper-2 border border-line p-3">
                <div className="text-xs font-bold uppercase tracking-widest text-muted mb-1.5">
                  Their message
                </div>
                <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed">
                  {messageFor(current)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn-coral" onClick={() => openFor(current)}>
                  Open WhatsApp for {current.name.split(" ")[0]}
                </button>
                <button className="btn-ghost" onClick={() => copy(messageFor(current), `m-${current.id}`)}>
                  {copied === `m-${current.id}` ? "Copied" : "Copy message"}
                </button>
                <button className="btn-ghost" onClick={() => copy(current.phone!, `p-${current.id}`)}>
                  {copied === `p-${current.id}` ? "Copied" : "Copy number"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                <button className="btn-coral !h-9 text-sm" onClick={markAndAdvance}>
                  Sent, next candidate
                </button>
                <button className="btn-ghost !h-9 text-sm"
                  onClick={() => setIndex((i) => Math.min(i + 1, reachable.length))}>
                  Skip for now
                </button>
              </div>
              <p className="text-xs text-muted-2">
                The message arrives typed into the box. Press send in WhatsApp, come back, then
                Sent. Marking as sent is your record, not WhatsApp&rsquo;s.
                {target === "app" && " The desktop app ignores pre-filled text: switch to WhatsApp Web above if the box is empty."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mx-auto mb-3">&#10003;</div>
              <p className="font-semibold">
                {sent.size} of {reachable.length} marked as sent
              </p>
              {sent.size < reachable.length && (
                <button className="btn-ghost !h-9 text-sm mt-3"
                  onClick={() => setIndex(Math.max(0, reachable.findIndex((r) => !sent.has(r.id))))}>
                  Go back to the ones you skipped
                </button>
              )}
            </div>
          )}
        </>
      )}

      {unreachable.length > 0 && (
        <div className="rounded-xl border border-coral/40 p-4" style={{ background: "#FFF4F2" }}>
          <div className="text-sm font-semibold text-ink mb-2">
            {unreachable.length} cannot be reached on WhatsApp
          </div>
          {unreachable.map((r) => (
            <div key={r.id} className="text-sm text-muted flex justify-between gap-3 py-0.5">
              <span>{r.name}</span>
              <span className="text-xs text-muted-2">{whyNotReachable(r.phone)}</span>
            </div>
          ))}
          <p className="text-xs text-muted-2 mt-2">
            Email or call them instead. They are listed rather than skipped quietly, because a
            person who never hears from you is the one who does not turn up.
          </p>
        </div>
      )}
    </div>
  );
}
