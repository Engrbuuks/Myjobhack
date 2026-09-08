"use client";
import { useState, useEffect } from "react";
import { callApi } from "@/lib/apiClient";

/**
 * Set up the paper an offer letter is printed on.
 *
 * The margins are the part people get wrong, so they are explained rather
 * than left as numbers: they are the distance from the top and bottom of the
 * page where the letterhead's own artwork ends and text may safely begin.
 * Set them too small and the first line lands on the logo.
 */
export function LetterheadManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [paper, setPaper] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [topMargin, setTopMargin] = useState("150");
  const [bottomMargin, setBottomMargin] = useState("110");
  const [isDefault, setIsDefault] = useState(true);

  async function load() {
    const r = await callApi("/api/admin/letterheads");
    if (r.ok) { setRows(r.data?.letterheads ?? []); setErr(null); } else setErr(r.error);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!paper) { setErr("Upload the letterhead file first."); return; }
    setBusy(true); setErr(null); setNote(null);
    const fd = new FormData();
    fd.append("name", name);
    fd.append("paper", paper);
    if (signature) fd.append("signature", signature);
    fd.append("signatory_name", signatoryName);
    fd.append("signatory_title", signatoryTitle);
    fd.append("top_margin_pt", topMargin);
    fd.append("bottom_margin_pt", bottomMargin);
    fd.append("is_default", String(isDefault));
    const r = await callApi("/api/admin/letterheads", { method: "POST", body: fd });
    if (r.ok) {
      setNote(r.data?.message ?? "Saved.");
      setOpen(false); setName(""); setPaper(null); setSignature(null);
      setSignatoryName(""); setSignatoryTitle("");
    } else setErr(r.error);
    setBusy(false);
    load();
  }

  async function patch(id: string, body: any) {
    const r = await callApi("/api/admin/letterheads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body })
    });
    if (!r.ok) setErr(r.error);
    load();
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Remove "${label}"? Offers already issued on it keep their stored copies.`)) return;
    const r = await callApi(`/api/admin/letterheads?id=${id}`, { method: "DELETE" });
    if (r.ok) setNote(r.data?.message ?? "Removed."); else setErr(r.error);
    load();
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="card p-4 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink mb-1">That didn&rsquo;t work</div>
          <p className="text-sm text-muted">{err}</p>
        </div>
      )}
      {note && <p className="text-sm font-medium text-ink">{note}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-coral" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "＋ Add a letterhead"}
        </button>
        <p className="text-sm text-muted-2">
          {rows.length} saved{rows.length ? "" : ". Offers will go out on plain paper until you add one."}
        </p>
      </div>

      {open && (
        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label !text-xs">Name it</label>
              <input className="input !h-10" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Eppme Digital Technologies" />
            </div>
            <div>
              <label className="label !text-xs">Letterhead file, PDF or PNG</label>
              <input className="input !h-10 !py-2 text-sm" type="file" accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setPaper(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <p className="text-xs text-muted-2">
            Upload the full page, not just the header strip. The whole page is used as the
            background, so side rules and footers are kept.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label !text-xs">Signature image, PNG with a clear background</label>
              <input className="input !h-10 !py-2 text-sm" type="file" accept=".png,.jpg,.jpeg"
                onChange={(e) => setSignature(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-2 mt-1">
                Optional. Without one, a blank line is left to sign by hand.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label !text-xs">Signed by</label>
                <input className="input !h-10" value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)} placeholder="Rita Adewale" />
              </div>
              <div>
                <label className="label !text-xs">Their title</label>
                <input className="input !h-10" value={signatoryTitle}
                  onChange={(e) => setSignatoryTitle(e.target.value)} placeholder="Head of People" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
              Where text may begin
            </div>
            <p className="text-xs text-muted-2 mb-3">
              Measured in points from the edge of the page, where 72 points is one inch. If the
              first line of a test letter lands on your logo, raise the top figure.
            </p>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="label !text-xs">From the top</label>
                <input className="input !h-10 !w-28" type="number" value={topMargin}
                  onChange={(e) => setTopMargin(e.target.value)} />
              </div>
              <div>
                <label className="label !text-xs">From the bottom</label>
                <input className="input !h-10 !w-28" type="number" value={bottomMargin}
                  onChange={(e) => setBottomMargin(e.target.value)} />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)} />
            Use this one by default
          </label>

          <button className="btn-coral" onClick={save} disabled={busy || !name.trim() || !paper}>
            {busy ? "Saving…" : "Save letterhead"}
          </button>
        </div>
      )}

      {rows.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-56">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{r.name}</span>
                {r.is_default && (
                  <span className="rounded-pill bg-coral text-white px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    default
                  </span>
                )}
                <span className="rounded-pill bg-paper-2 border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-2">
                  {r.file_kind}
                </span>
              </div>
              <div className="text-sm text-muted-2 mt-1">
                {r.signatory_name
                  ? `Signed by ${r.signatory_name}${r.signatory_title ? `, ${r.signatory_title}` : ""}`
                  : "No signatory set"}
                {!r.signature_path && " · no signature image, a blank line is left"}
              </div>
              <div className="text-xs text-muted-2 mt-1">
                Text begins {r.top_margin_pt}pt from the top, {r.bottom_margin_pt}pt from the bottom
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {!r.is_default && (
                <button className="btn-ghost !h-9 text-xs" onClick={() => patch(r.id, { is_default: true })}>
                  Make default
                </button>
              )}
              <button className="btn-ghost !h-9 text-xs" onClick={() => remove(r.id, r.name)}>Remove</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
