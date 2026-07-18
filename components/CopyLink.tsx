"use client";
import { useState } from "react";

export function CopyLink({ path, label = "Copy share link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(url); } catch {
      const t = document.createElement("textarea");
      t.value = url; document.body.appendChild(t); t.select();
      document.execCommand("copy"); document.body.removeChild(t);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={copy} className="btn-ghost !h-10 text-sm">
      {copied ? "Copied ✓" : `🔗 ${label}`}
    </button>
  );
}
