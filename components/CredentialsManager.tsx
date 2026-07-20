"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cred = {
  id: string; kind: string; institution: string; title: string;
  year: number | null; status: string; created_at: string;
};

const KINDS = [
  ["degree", "Degree"],
  ["certificate", "Certificate"],
  ["membership", "Professional membership"],
  ["license", "License"],
  ["award", "Award"]
];

const STATUS_STYLE: Record<string, string> = {
  verified: "bg-green-100 text-green-700",
  pending: "bg-coral-soft text-coral",
  in_review: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-600"
};

export function CredentialsManager({ initial }: { initial: Cred[] }) {
  const [creds, setCreds] = useState<Cred[]>(initial);
  const [open, setOpen] = useState(initial.length === 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [kind, setKind] = useState("degree");
  const [institution, setInstitution] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const supabase = createClient();

  async function submit() {
    setErr(null);
    if (!institution.trim()) { setErr("Institution is required."); return; }
    if (!title.trim()) { setErr("Title is required."); return; }
    if (!file) { setErr("Please attach the document (PDF or image)."); return; }

    setBusy(true);
    try {
      // upload the document via the shared uploader
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "credential");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upJson = await up.json();
      if (!up.ok) { setErr(upJson.error ?? "Upload failed."); setBusy(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("credentials").insert({
        talent_id: user!.id,
        kind, institution: institution.trim(), title: title.trim(),
        year: year ? Number(year) : null,
        document_id: upJson.document.id,
        status: "pending"
      }).select("id, kind, institution, title, year, status, created_at").single();

      if (error) { setErr(error.message); setBusy(false); return; }

      setCreds([data as Cred, ...creds]);
      setInstitution(""); setTitle(""); setYear(""); setFile(null); setKind("degree");
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {creds.length > 0 && (
        <div className="space-y-3">
          {creds.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-white p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold truncate">{c.title}</div>
                <div className="text-sm text-muted-2 truncate">
                  {KINDS.find((k) => k[0] === c.kind)?.[1] ?? c.kind} · {c.institution}{c.year ? ` · ${c.year}` : ""}
                </div>
              </div>
              <span className={`shrink-0 px-3 py-1 rounded-pill text-xs font-bold capitalize ${STATUS_STYLE[c.status] ?? "bg-paper-2 text-muted"}`}>
                {c.status === "in_review" ? "In review" : c.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button className="btn-coral" onClick={() => setOpen(true)}>+ Add a credential</button>
      ) : (
        <div className="rounded-2xl border border-line bg-white p-6 space-y-4">
          <h3 className="font-display font-semibold text-lg">Add a credential</h3>
          <div>
            <label className="label">Type <span className="text-coral">*</span></label>
            <div className="flex flex-wrap gap-2">
              {KINDS.map(([v, l]) => (
                <button key={v} type="button"
                  className={`px-4 py-2 rounded-pill text-sm font-semibold border transition ${kind === v ? "bg-ink text-white border-ink" : "border-line hover:border-coral"}`}
                  onClick={() => setKind(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Institution / body <span className="text-coral">*</span></label>
              <input className="input" value={institution} onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. University of Lagos" />
            </div>
            <div>
              <label className="label">Year</label>
              <input className="input" type="number" min={1950} max={2030} value={year}
                onChange={(e) => setYear(e.target.value)} placeholder="2021" />
            </div>
          </div>
          <div>
            <label className="label">Title <span className="text-coral">*</span></label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. BSc Accounting, or ICAN Membership" />
          </div>
          <div>
            <label className="label">Document (PDF or image) <span className="text-coral">*</span></label>
            <input type="file" accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-pill file:border-0 file:bg-ink file:text-white file:font-semibold file:cursor-pointer" />
            {file && <p className="text-xs text-muted-2 mt-1.5">{file.name}</p>}
            <p className="text-xs text-muted-2 mt-1.5">A clear photo or scan of the certificate. Under 10MB.</p>
          </div>
          {err && <p className="text-coral text-sm">{err}</p>}
          <div className="flex gap-3">
            <button className="btn-coral" onClick={submit} disabled={busy}>
              {busy ? "Uploading…" : "Submit for verification"}
            </button>
            {creds.length > 0 && <button className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-2">
        Once submitted, our team reviews each credential. You'll get an email when your profile is verified.
      </p>
    </div>
  );
}
