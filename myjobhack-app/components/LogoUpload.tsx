"use client";
import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX = 2 * 1024 * 1024;
const OK = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function LogoUpload({
  value, onChange, label = "Company logo"
}: { value: string | null; onChange: (path: string | null) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const publicUrl = value
    ? supabase.storage.from("company-logos").getPublicUrl(value).data.publicUrl
    : null;

  async function pick(file: File) {
    setErr(null);
    if (file.size > MAX) { setErr("Logo must be under 2MB."); return; }
    if (!OK.includes(file.type)) { setErr("Use PNG, JPG, WebP, or SVG."); return; }

    setBusy(true);
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-60);
    const path = `${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from("company-logos")
      .upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onChange(path);
  }

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl border border-line bg-paper grid place-items-center overflow-hidden shrink-0">
          {publicUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={publicUrl} alt="" className="w-full h-full object-contain p-1.5" />
            : <span className="text-muted-2 text-xl">◈</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost !h-10 text-sm" disabled={busy}
            onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : publicUrl ? "Replace" : "Upload logo"}
          </button>
          {publicUrl && (
            <button type="button" className="btn-ghost !h-10 text-sm text-coral" onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept={OK.join(",")} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
      <p className="text-xs text-muted-2 mt-1.5">Square works best. PNG or SVG with a transparent background, under 2MB.</p>
      {err && <p className="text-xs text-coral mt-1">{err}</p>}
    </div>
  );
}
