"use client";
import { useState, useEffect } from "react";
import { waNumber } from "@/lib/whatsapp";

/**
 * Find out which WhatsApp link works on THIS machine, then stop guessing.
 *
 * Whether a pre-filled message survives depends on things not visible from
 * the server: which browser, whether WhatsApp Desktop has registered itself
 * as the handler for whatsapp:// and for web.whatsapp.com links, and whether
 * this browser has a WhatsApp Web session. Those combinations behave
 * differently and no amount of reasoning from here settles it.
 *
 * So: send one message to your own number through each variant, see which
 * arrives with the text filled in, and save that one. Everything else in the
 * app then uses it.
 */

type Variant = {
  id: string;
  label: string;
  note: string;
  build: (num: string, text: string) => string;
};

const VARIANTS: Variant[] = [
  {
    id: "web_send",
    label: "WhatsApp Web, send endpoint",
    note: "Usually fills the message. Needs this browser signed in to WhatsApp Web.",
    build: (n, t) => `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`
  },
  {
    id: "wa_me",
    label: "wa.me short link",
    note: "The official click to chat link. Redirects, which is where some setups lose the text.",
    build: (n, t) => `https://wa.me/${n}?text=${encodeURIComponent(t)}`
  },
  {
    id: "api_send",
    label: "api.whatsapp.com",
    note: "Hands off to the desktop app when one is installed.",
    build: (n, t) => `https://api.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(t)}`
  },
  {
    id: "protocol",
    label: "whatsapp:// protocol",
    note: "Opens the desktop app directly with no browser load.",
    build: (n, t) => `whatsapp://send?phone=${n}&text=${encodeURIComponent(t)}`
  },
  {
    id: "web_send_plus",
    label: "WhatsApp Web with a plus prefix",
    note: "Same as the first, with the number written internationally. Some builds want this form.",
    build: (n, t) => `https://web.whatsapp.com/send?phone=%2B${n}&text=${encodeURIComponent(t)}`
  },
  {
    id: "wa_me_slash",
    label: "wa.me with no query",
    note: "Opens the chat only, no message. Tells you whether the number itself is the problem.",
    build: (n) => `https://wa.me/${n}`
  }
];

const STORAGE_KEY = "mjh_wa_variant";

export function WhatsAppTester({ defaultNumber, onChosen }: {
  defaultNumber?: string; onChosen?: (id: string) => void;
}) {
  const [num, setNum] = useState(defaultNumber ?? "");
  const [text, setText] = useState("Test from MYJOBHACK. If you can read this in the message box, this link works.");
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setChosen(saved);
    } catch { /* storage can be blocked; the tester still works */ }
  }, []);

  const digits = waNumber(num);

  function open(v: Variant) {
    if (!digits) return;
    setTried((t) => new Set(t).add(v.id));
    // A named window, so repeated tests reuse one tab rather than piling up.
    window.open(v.build(digits, text), "mjh_wa_test");
  }

  function choose(id: string) {
    setChosen(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch {}
    onChosen?.(id);
  }

  async function copy(s: string, id: string) {
    try {
      await navigator.clipboard.writeText(s);
      setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch { window.prompt("Copy this URL:", s); }
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold text-lg">Find the link that works here</h3>
        <p className="text-sm text-muted-2 mt-1">
          Send a test to your own number through each option below. Whichever arrives with the
          message already typed is the one this machine supports. Save it and the app uses it
          everywhere.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label !text-xs">Your own WhatsApp number</label>
          <input className="input !h-10" value={num} onChange={(e) => setNum(e.target.value)}
            placeholder="+2348031234567" />
          {num && !digits && (
            <p className="text-xs text-coral mt-1">
              That is not a usable number. Include the country code.
            </p>
          )}
        </div>
        <div>
          <label className="label !text-xs">Test message</label>
          <input className="input !h-10" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>

      {chosen && (
        <div className="rounded-xl border border-coral/40 p-3" style={{ background: "#FFF4F2" }}>
          <p className="text-sm text-ink">
            Saved: <strong>{VARIANTS.find((v) => v.id === chosen)?.label}</strong>. Sends will use
            this. Test again any time if it stops behaving.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {VARIANTS.map((v) => {
          const url = digits ? v.build(digits, text) : "";
          const isChosen = chosen === v.id;
          return (
            <div key={v.id} className={`rounded-xl border p-3 ${isChosen ? "border-coral" : "border-line"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-56">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{v.label}</span>
                    {tried.has(v.id) && !isChosen && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-2">tried</span>
                    )}
                    {isChosen && (
                      <span className="rounded-pill bg-coral text-white px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        in use
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-2 mt-1">{v.note}</p>
                  {url && (
                    <code className="block text-[11px] text-muted-2 mt-1.5 break-all">
                      {url.length > 110 ? url.slice(0, 110) + "…" : url}
                    </code>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn-ghost !h-9 text-xs" disabled={!digits}
                    onClick={() => copy(url, v.id)}>
                    {copied === v.id ? "Copied" : "Copy URL"}
                  </button>
                  <button className="btn-ghost !h-9 text-xs" disabled={!digits} onClick={() => open(v)}>
                    Test
                  </button>
                  <button className={isChosen ? "btn-ghost !h-9 text-xs" : "btn-coral !h-9 text-xs"}
                    onClick={() => choose(v.id)}>
                    {isChosen ? "Saved" : "This one worked"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
          What the results mean
        </div>
        <ul className="text-xs text-muted-2 space-y-1.5">
          <li>
            <strong className="text-ink">Chat opens, message filled.</strong> That variant works.
            Save it.
          </li>
          <li>
            <strong className="text-ink">Chat opens, box empty.</strong> Something is intercepting
            the link and dropping the text, usually WhatsApp Desktop. Try a variant that stays in
            the browser, or quit the desktop app and test again.
          </li>
          <li>
            <strong className="text-ink">A QR code appears.</strong> This browser is not signed in
            to WhatsApp Web. Scan it once, then test again.
          </li>
          <li>
            <strong className="text-ink">Dark or blank screen.</strong> WhatsApp Web is loading, or
            failed to. Give it a few seconds. If it stays blank, that variant is not viable here.
          </li>
          <li>
            <strong className="text-ink">Nothing happens at all.</strong> The browser blocked the
            popup, or no handler is registered for whatsapp:// links.
          </li>
          <li>
            <strong className="text-ink">The last option fails too.</strong> Then the number
            itself is the problem, not the link. Check it is on WhatsApp.
          </li>
        </ul>
      </div>
    </div>
  );
}
