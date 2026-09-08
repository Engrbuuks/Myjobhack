"use client";
import { useState } from "react";
import { waLink, forWhatsApp, whyNotReachable, RESUMPTION_TEMPLATE, REMINDER_TEMPLATE } from "@/lib/whatsapp";
import { renderApplicantTemplate, applicantVars, APPLICANT_TOKENS } from "@/lib/applicantEmail";

type Row = {
  id: string; name: string; phone?: string | null; email: string;
  applied_location?: string | null; status: string;
};

/**
 * Send WhatsApp messages to selected candidates, one tap each.
 *
 * Each row opens WhatsApp with that person's message already written, and is
 * ticked off once opened, so a list of thirty can be worked through without
 * losing your place or messaging anyone twice.
 */
export function WhatsAppBlast({ rows, jobTitle, senderName, onClose }: {
  rows: Row[]; jobTitle: string; senderName: string; onClose?: () => void;
}) {
  const [template, setTemplate] = useState(RESUMPTION_TEMPLATE);
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  /**
   * Two entry points, because neither works everywhere. api.whatsapp.com
   * usually hands off to the installed app; wa.me sometimes lands on a blank
   * page when the browser is not signed in to WhatsApp Web. If one fails,
   * switching is quicker than diagnosing why.
   */
  const [mode, setMode] = useState<"api" | "wa">("api");

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      // Clipboard access can be blocked. Select the text manually instead.
      window.prompt("Copy this:", text);
    }
  }

  const messageFor = (r: Row) => forWhatsApp(renderApplicantTemplate(template, applicantVars({
    name: r.name, role: jobTitle, company: "MYJOBHACK", email: r.email,
    phone: r.phone ?? "", location: r.applied_location ?? "",
    stage: r.status, sender: senderName, detail
  })));

  const reachable = rows.filter((r) => !whyNotReachable(r.phone));
  const unreachable = rows.filter((r) => whyNotReachable(r.phone));

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg">
            WhatsApp {reachable.length} candidate{reachable.length === 1 ? "" : "s"}
          </h3>
          <p className="text-sm text-muted-2 mt-1">
            Each opens WhatsApp with the message written. You press send. Nothing is sent from here.
          </p>
        </div>
        {onClose && <button className="text-muted-2 hover:text-ink" onClick={onClose}>✕</button>}
      </div>

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
            <button key={t.token} title={t.means}
              onClick={() => setTemplate((v) => v + t.token)}
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

      {reachable.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">
              Send one by one
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-2">{done.size} of {reachable.length} opened</span>
              <button className="text-xs text-muted hover:text-ink underline"
                onClick={() => setMode((m) => (m === "api" ? "wa" : "api"))}>
                {mode === "api" ? "Opens blank? Try wa.me" : "Using wa.me, switch back"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-line divide-y divide-line max-h-80 overflow-y-auto">
            {reachable.map((r) => {
              const msg = messageFor(r);
              const link = waLink(r.phone!, msg, mode)!;
              const sent = done.has(r.id);
              return (
                <div key={r.id} className={`p-3 ${sent ? "bg-paper-2" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-2">{r.phone}</div>
                    </div>
                    {/* If the link opens a blank page, these two always work:
                        copy the message, open WhatsApp yourself, paste. */}
                    <button className="btn-ghost !h-9 text-xs shrink-0"
                      onClick={() => copy(msg, `m-${r.id}`)}>
                      {copied === `m-${r.id}` ? "Copied" : "Copy message"}
                    </button>
                    <button className="btn-ghost !h-9 text-xs shrink-0"
                      onClick={() => copy(r.phone!, `p-${r.id}`)}>
                      {copied === `p-${r.id}` ? "Copied" : "Copy number"}
                    </button>
                    <a href={link} target="_blank" rel="noopener noreferrer"
                      onClick={() => setDone((d) => new Set(d).add(r.id))}
                      className={`shrink-0 ${sent ? "btn-ghost !h-9 text-xs" : "btn-coral !h-9 text-xs"}`}>
                      {sent ? "Open again" : "Open WhatsApp"}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-2 mt-2">
            Ticking off happens when you open the link, not when the message is delivered, so
            confirm in WhatsApp that it actually sent. If a link opens a blank page, copy the
            message and the number and paste them into WhatsApp yourself, or switch entry point
            above.
          </p>
        </div>
      )}

      {reachable.length > 0 && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            All numbers and one message, for copying
          </summary>
          <p className="text-xs text-muted-2 mt-2 mb-3">
            Useful for a WhatsApp broadcast list. The message below has no personal tokens
            filled in, because a broadcast goes to everyone unchanged.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button className="btn-ghost !h-9 text-xs"
              onClick={() => copy(reachable.map((r) => r.phone).join(", "), "all-numbers")}>
              {copied === "all-numbers" ? "Copied" : `Copy all ${reachable.length} numbers`}
            </button>
            <button className="btn-ghost !h-9 text-xs"
              onClick={() => copy(messageFor({ ...reachable[0], name: "there" } as any), "generic")}>
              {copied === "generic" ? "Copied" : "Copy the message"}
            </button>
          </div>
          <textarea readOnly className="input !h-auto py-2 text-xs" rows={3}
            value={reachable.map((r) => r.phone).join(", ")} />
        </details>
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
            Email them instead, or call. They are listed rather than skipped quietly, because a
            person who never hears from you is the one who does not turn up.
          </p>
        </div>
      )}
    </div>
  );
}
