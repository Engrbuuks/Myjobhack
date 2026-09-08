"use client";
import { useState, useRef, useEffect } from "react";
import { DIAL_CODES, checkPhone } from "@/lib/phone";

/**
 * Phone entry for the public apply form.
 *
 * WHY THIS IS NOT A NATIVE SELECT: the browser renders a select's dropdown
 * list itself, and it does not inherit the page's dark styling. On this form
 * that produced a white panel with white text, readable only on hover. Option
 * background colours are honoured inconsistently across browsers and not at
 * all on iOS, so the list is built here instead. Full control, same
 * appearance everywhere.
 *
 * The field is required. Its validation runs as the person types, so a
 * mistake is visible beside the box rather than after they press apply.
 */
export function PhoneField({
  dial, setDial, phone, setPhone, showError
}: {
  dial: string; setDial: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  showError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    setTimeout(() => searchRef.current?.focus(), 10);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = DIAL_CODES.find((d) => d.code === dial) ?? DIAL_CODES[0];
  const list = query.trim()
    ? DIAL_CODES.filter((d) =>
        d.label.toLowerCase().includes(query.toLowerCase()) ||
        d.code.includes(query) || d.iso.toLowerCase().includes(query.toLowerCase()))
    : DIAL_CODES;

  const touched = phone.trim() !== "";
  const result = checkPhone(phone, dial);
  const invalid = (touched || showError) && !result.ok;

  const field = "w-full h-12 rounded-xl bg-white/[.06] border text-white placeholder-white/40 px-4 outline-none transition focus:border-white/40";

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative shrink-0" ref={boxRef}>
          <button type="button" onClick={() => { setOpen((o) => !o); setQuery(""); }}
            aria-haspopup="listbox" aria-expanded={open}
            aria-label={`Country dialling code, currently ${current.label}`}
            className={`${field} !w-auto flex items-center gap-2 pr-3 ${
              invalid ? "border-[#FFB4AC]/60" : "border-white/15"}`}>
            <span className="font-medium">{current.code}</span>
            <span className="text-white/50 text-sm">{current.iso}</span>
            <span className="text-white/40 text-xs">▾</span>
          </button>

          {open && (
            <div role="listbox"
              className="absolute z-50 mt-2 w-64 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#0B3A3C] shadow-2xl p-1">
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country"
                className="w-full h-10 rounded-lg bg-white/[.06] border border-white/10 text-white placeholder-white/40 px-3 text-sm outline-none mb-1" />
              {list.map((d) => (
                <button key={d.code} type="button" role="option" aria-selected={d.code === dial}
                  onClick={() => { setDial(d.code); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center gap-3 ${
                    d.code === dial ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
                  <span className="font-medium w-14 shrink-0">{d.code}</span>
                  <span className="truncate">{d.label}</span>
                </button>
              ))}
              {list.length === 0 && (
                <p className="px-3 py-3 text-sm text-white/50">No country matches that.</p>
              )}
            </div>
          )}
        </div>

        <input inputMode="tel" required aria-label="Phone number" aria-invalid={invalid}
          className={`${field} flex-1 ${invalid ? "border-[#FFB4AC]/60" : "border-white/15"}`}
          placeholder={dial === "+234" ? "8031234567 or 08031234567" : "Phone number"}
          value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {invalid ? (
        <p className="text-xs text-[#FFB4AC] mt-1.5">{(result as any).error}</p>
      ) : (
        <p className="text-xs text-white/40 mt-1.5">
          Required. We use this to reach you about your application.
        </p>
      )}
    </div>
  );
}
