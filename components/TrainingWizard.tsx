"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const FORMATS = [
  { v: "lms", title: "LMS course", desc: "Self-paced on our platform — modules, lessons, quizzes, certificate.", icon: "▤" },
  { v: "virtual", title: "Live virtual", desc: "Zoom / Meet session — registration, attendance, reminders.", icon: "◉" },
  { v: "physical", title: "In person", desc: "Physical venue — registration and attendance handled.", icon: "⚑" }
];

export function TrainingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [about, setAbout] = useState("");
  const [expectations, setExpectations] = useState("");
  const [facilitator, setFacilitator] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [where, setWhere] = useState("");
  const [priceNgn, setPriceNgn] = useState("0");
  const [priceUsd, setPriceUsd] = useState("0");
  const [thumbId, setThumbId] = useState<string | null>(null);
  const [thumbName, setThumbName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadThumb(file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "other");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) { setErr(json.error); return; }
    setThumbId(json.document.id); setThumbName(file.name);
  }

  async function create() {
    if (!title.trim()) { setErr("Title is required"); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("trainings").insert({
      title: title.trim(), description: about.slice(0, 240),
      delivery: format === "lms" ? "lms" : "external",
      format, topic, about, expectations,
      facilitator_name: facilitator,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      location_or_link: where,
      price_ngn: Number(priceNgn) || 0, price_usd: Number(priceUsd) || 0,
      thumbnail_document_id: thumbId,
      status: "draft", created_by: user!.id
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/portal/admin/trainings/${data.id}`);
  }

  if (step === 1) {
    return (
      <div className="max-w-3xl">
        <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">Step 1 of 2 — What kind of training is this?</div>
        <div className="grid sm:grid-cols-3 gap-4">
          {FORMATS.map((f) => (
            <button key={f.v} onClick={() => { setFormat(f.v); setStep(2); }}
              className="card p-6 text-left hover:border-coral hover:-translate-y-0.5 transition-all duration-300 group">
              <span className="w-11 h-11 rounded-full bg-coral-soft text-coral grid place-items-center text-lg mb-4">{f.icon}</span>
              <div className="font-display font-semibold text-lg mb-1">{f.title}</div>
              <p className="text-xs text-muted leading-relaxed">{f.desc}</p>
              <div className="text-coral text-sm font-semibold mt-3 opacity-0 group-hover:opacity-100 transition">Choose →</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const fmt = FORMATS.find((f) => f.v === format)!;
  return (
    <div className="max-w-2xl">
      <button className="text-sm font-semibold text-muted hover:text-coral transition mb-4" onClick={() => setStep(1)}>
        ← {fmt.title} · change type
      </button>
      <div className="card p-6 space-y-4">
        <div><label className="label">Training title *</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Topic / track</label>
            <input className="input" placeholder="e.g. Financial modelling" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
          <div><label className="label">Facilitator</label>
            <input className="input" placeholder="Name of the expert" value={facilitator} onChange={(e) => setFacilitator(e.target.value)} /></div>
        </div>
        <div><label className="label">About this {format === "lms" ? "course" : "training"}</label>
          <textarea className="input !h-auto py-3" rows={3} value={about} onChange={(e) => setAbout(e.target.value)} /></div>
        <div><label className="label">What participants should expect</label>
          <textarea className="input !h-auto py-3" rows={3}
            placeholder={"One expectation per line…"} value={expectations} onChange={(e) => setExpectations(e.target.value)} /></div>

        {format !== "lms" && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">Date & time (WAT)</label>
              <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div><label className="label">{format === "physical" ? "Venue address" : "Session link (Zoom/Meet)"}</label>
              <input className="input" placeholder={format === "physical" ? "e.g. The Hub, Yaba, Lagos" : "https://meet.google.com/…"}
                value={where} onChange={(e) => setWhere(e.target.value)} /></div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Price ₦ (0 = free)</label>
            <input className="input" type="number" value={priceNgn} onChange={(e) => setPriceNgn(e.target.value)} /></div>
          <div><label className="label">Price $ (0 = free)</label>
            <input className="input" type="number" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} /></div>
        </div>

        <div>
          <label className="label">Thumbnail — 1200 × 675px (16:9), JPG or PNG, under 2MB</label>
          <label className="card border-dashed flex items-center gap-3 p-4 cursor-pointer hover:border-coral transition">
            <input type="file" className="hidden" accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadThumb(e.target.files[0])} />
            <span className="w-9 h-9 rounded-full bg-coral-soft text-coral grid place-items-center">↑</span>
            <span className="text-sm">{thumbName ?? "Upload thumbnail (compressed & converted automatically)"}</span>
          </label>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button className="btn-coral" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create training →"}
          </button>
          {err && <span className="text-coral text-sm">{err}</span>}
        </div>
        <p className="text-xs text-muted-2">
          {format === "lms"
            ? "Next: attach or build the course, then open it and fill it via the Invite Engine."
            : "Created as a draft — set it open when you're ready, then fill it via the Invite Engine."}
        </p>
      </div>
    </div>
  );
}
