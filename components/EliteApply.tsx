"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DISTINCTIONS = ["First Class", "Best Graduating Student", "Top 5%", "Distinction (Masters)", "Scholar / Fellow"];

export function EliteApply({ chapters }: { chapters: { id: string; city: string; country: string }[] }) {
  const router = useRouter();
  const [institution, setInstitution] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("");
  const [distinction, setDistinction] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "credential");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); return; }
    setDocId(json.document.id); setDocName(file.name);
  }

  async function submit() {
    if (!institution || !distinction || !docId) {
      setErr("Institution, distinction, and your credential document are required."); return;
    }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error: e1 } = await supabase.from("credentials").insert({
      talent_id: user!.id, kind: "degree", institution,
      title: course, year: year ? Number(year) : null,
      distinction, document_id: docId
    });
    const { error: e2 } = await supabase.from("elite_memberships").insert({
      talent_id: user!.id, distinction, chapter_id: chapterId || null
    });
    setBusy(false);
    const bad = e1 ?? e2;
    if (bad && !bad.message.includes("duplicate")) { setErr(bad.message); return; }
    setDone(true); router.refresh();
  }

  if (done) {
    return (
      <div className="card p-8 text-center max-w-lg">
        <div className="w-12 h-12 rounded-full bg-ink text-white grid place-items-center text-xl mx-auto mb-4">✓</div>
        <div className="font-display font-semibold text-2xl mb-2">Application received</div>
        <p className="text-sm text-muted">
          Our verification team will review your credentials. Once confirmed, your portal transforms — chapter, member number, the room.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 max-w-lg">
      <div className="space-y-4">
        <div><label className="label">Institution *</label>
          <input className="input" placeholder="e.g. University of Lagos"
            value={institution} onChange={(e) => setInstitution(e.target.value)} /></div>
        <div className="grid sm:grid-cols-[1fr_120px] gap-4">
          <div><label className="label">Course of study</label>
            <input className="input" placeholder="e.g. Economics" value={course} onChange={(e) => setCourse(e.target.value)} /></div>
          <div><label className="label">Grad year</label>
            <input className="input" type="number" placeholder="2024" value={year} onChange={(e) => setYear(e.target.value)} /></div>
        </div>
        <div>
          <label className="label">Your distinction *</label>
          <div className="flex flex-wrap gap-2">
            {DISTINCTIONS.map((d) => (
              <button key={d} type="button"
                className={`px-4 h-10 rounded-pill border text-sm font-semibold transition ${
                  distinction === d ? "bg-coral border-coral text-white" : "border-line hover:border-coral"}`}
                onClick={() => setDistinction(d)}>{d}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Preferred chapter</label>
          <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">Choose your city…</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.city}, {c.country}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Credential document * — certificate, transcript, or confirmation letter</label>
          <label className="card border-dashed flex items-center gap-3 p-4 cursor-pointer hover:border-coral transition">
            <input type="file" className="hidden" accept=".pdf,.docx,image/*"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <span className="w-9 h-9 rounded-full bg-coral-soft text-coral grid place-items-center">↑</span>
            <span className="text-sm font-medium">{docName ?? "Upload your proof (compressed automatically)"}</span>
          </label>
        </div>
      </div>
      <button className="btn-coral w-full justify-center mt-6" onClick={submit} disabled={busy}>
        {busy ? "Submitting…" : "Submit for verification →"}
      </button>
      {err && <p className="text-coral text-sm mt-3">{err}</p>}
    </div>
  );
}
