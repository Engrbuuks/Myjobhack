"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LocationPicker } from "@/components/LocationPicker";

type Tax = { id: string; kind: string; label: string };
type Props = {
  profile: { full_name: string; phone: string | null; country: string | null; city: string | null };
  talent: {
    niche_id: string | null; career_goal_id: string | null;
    headline: string | null; summary: string | null; years_experience: number;
    salary_min: number | null; salary_max: number | null; salary_currency: string;
    expected_role_level: string | null; preferred_work_mode: string | null; relocation: string; custom_skills?: string[];
    resume_document_id: string | null;
  };
  expertiseIds: string[];
  taxonomies: Tax[];
  resumeName: string | null;
};

const LEVELS = ["entry", "junior", "mid", "senior", "lead", "executive"];
const MODES = ["remote", "hybrid", "onsite", "flexible"];
const RELOC = [
  ["none", "Not open to relocating"],
  ["domestic", "Open within my country"],
  ["international", "Open internationally"]
] as const;
const STEPS = ["About you", "Your focus", "Expectations", "Resume"];

export function ProfileWizard(p: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // step 1
  const [fullName, setFullName] = useState(p.profile.full_name);
  const [phone, setPhone] = useState(p.profile.phone ?? "");
  const [country, setCountry] = useState(p.profile.country ?? "");
  const [city, setCity] = useState(p.profile.city ?? "");
  const [years, setYears] = useState(p.talent.years_experience);
  const [headline, setHeadline] = useState(p.talent.headline ?? "");
  // step 2
  const [nicheId, setNicheId] = useState(p.talent.niche_id ?? "");
  const [goalId, setGoalId] = useState(p.talent.career_goal_id ?? "");
  const [expertise, setExpertise] = useState<string[]>(p.expertiseIds);
  const [customSkills, setCustomSkills] = useState<string[]>(p.talent.custom_skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const totalSkills = () => expertise.length + customSkills.length;
  // step 3
  const [salMin, setSalMin] = useState(p.talent.salary_min?.toString() ?? "");
  const [salMax, setSalMax] = useState(p.talent.salary_max?.toString() ?? "");
  const [currency, setCurrency] = useState(p.talent.salary_currency || "NGN");
  const [level, setLevel] = useState(p.talent.expected_role_level ?? "");
  const [mode, setMode] = useState(p.talent.preferred_work_mode ?? "");
  const [reloc, setReloc] = useState(p.talent.relocation || "none");
  // step 4
  const [resumeId, setResumeId] = useState(p.talent.resume_document_id);
  const [resumeName, setResumeName] = useState(p.resumeName);
  const [uploading, setUploading] = useState(false);

  const niches = useMemo(() => p.taxonomies.filter((t) => t.kind === "niche"), [p.taxonomies]);
  const goals = useMemo(() => p.taxonomies.filter((t) => t.kind === "career_goal"), [p.taxonomies]);
  const skills = useMemo(() => p.taxonomies.filter((t) => t.kind === "expertise"), [p.taxonomies]);

  const completion = useMemo(() => {
    let pct = 0;
    if (fullName && phone && country && city) pct += 30;
    if (nicheId && goalId && (expertise.length + customSkills.length) > 0) pct += 30;
    if (salMin && salMax && level && mode) pct += 25;
    if (resumeId) pct += 15;
    return pct;
  }, [fullName, phone, country, city, nicheId, goalId, expertise, customSkills, salMin, salMax, level, mode, resumeId]);

  function toggleSkill(id: string) {
    setExpertise((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : (cur.length + customSkills.length) < 6 ? [...cur, id] : cur
    );
  }

  function addCustomSkill() {
    const v = skillInput.trim();
    if (!v) return;
    if (totalSkills() >= 6) { setErr("You can add up to 6 areas of expertise in total."); return; }
    // avoid dupes (case-insensitive) against existing custom + taxonomy labels
    const existingLabels = [
      ...customSkills.map((s) => s.toLowerCase()),
      ...skills.filter((s) => expertise.includes(s.id)).map((s) => s.label.toLowerCase())
    ];
    if (existingLabels.includes(v.toLowerCase())) { setSkillInput(""); return; }
    setCustomSkills((c) => [...c, v]);
    setSkillInput("");
  }

  function removeCustomSkill(v: string) {
    setCustomSkills((c) => c.filter((x) => x !== v));
  }

  async function uploadResume(file: File) {
    setUploading(true); setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "resume");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) { setErr(json.error ?? "Upload failed"); return; }
    setResumeId(json.document.id);
    setResumeName(file.name);
    setSavedNote(
      json.saved_pct > 0 ? `Uploaded & compressed — ${json.saved_pct}% smaller.` : "Uploaded."
    );
  }

  // Every field required. Each step must be complete before advancing.
  function stepError(s: number): string | null {
    if (s === 0) {
      if (!fullName.trim()) return "Full name is required.";
      if (!phone.trim()) return "Phone number is required.";
      if (!country.trim()) return "Country is required.";
      if (!city.trim()) return "City / State is required.";
      if (!years && years !== 0) return "Years of experience is required.";
      if (!headline.trim()) return "Professional headline is required.";
    }
    if (s === 1) {
      if (!nicheId) return "Please select your niche.";
      if (!goalId) return "Please select your career goal.";
      if (expertise.length + customSkills.length === 0) return "Add at least one area of expertise.";
    }
    if (s === 2) {
      if (!salMin || !salMax) return "Expected salary range is required.";
      if (!level) return "Expected role level is required.";
      if (!mode) return "Preferred work mode is required.";
    }
    if (s === 3) {
      if (!resumeId) return "Please upload your resume.";
    }
    return null;
  }

  async function save(finish: boolean) {
    const ve = stepError(step);
    if (ve) { setErr(ve); return; }

    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Session expired — sign in again."); setBusy(false); return; }

    const { error: e1 } = await supabase.from("profiles")
      .update({ full_name: fullName, phone, country, city, onboarded: completion >= 60 })
      .eq("id", user.id);
    const { error: e2 } = await supabase.from("talent_profiles")
      .update({
        custom_skills: customSkills,
        niche_id: nicheId || null,
        career_goal_id: goalId || null,
        headline: headline || null,
        years_experience: years,
        salary_min: salMin ? Number(salMin) : null,
        salary_max: salMax ? Number(salMax) : null,
        salary_currency: currency,
        expected_role_level: (level || null) as any,
        preferred_work_mode: (mode || null) as any,
        relocation: reloc as any,
        resume_document_id: resumeId,
        profile_completion: completion
      })
      .eq("profile_id", user.id);

    await supabase.from("talent_expertise").delete().eq("talent_id", user.id);
    const { error: e3 } = expertise.length
      ? await supabase.from("talent_expertise")
          .insert(expertise.map((taxonomy_id) => ({ talent_id: user.id, taxonomy_id })))
      : { error: null as any };

    const bad = e1 ?? e2 ?? e3;
    if (bad) { setErr(bad.message); setBusy(false); return; }

    if (finish) { router.push("/portal/seeker"); router.refresh(); }
    else { setSavedNote("Progress saved."); setBusy(false); setStep((s) => Math.min(s + 1, 3)); }
  }

  const chip = (on: boolean) =>
    `px-4 h-10 rounded-pill border text-sm font-semibold transition ${
      on ? "bg-coral border-coral text-white" : "border-line bg-white text-ink hover:border-coral"
    }`;

  return (
    <div className="max-w-2xl">
      {/* progress */}
      <div className="flex items-center gap-3 mb-8">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition ${
              i === step ? "text-coral" : i < step ? "text-ink" : "text-muted-2"
            }`}>
            <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] ${
              i === step ? "bg-coral text-white" : i < step ? "bg-ink text-white" : "bg-paper-2 text-muted"
            }`}>{i + 1}</span>
            <span className="hidden sm:inline">{s}</span>
          </button>
        ))}
        <span className="ml-auto font-display font-semibold text-lg">{completion}%</span>
      </div>
      <div className="h-1.5 rounded-pill bg-paper-2 mb-10 overflow-hidden">
        <div className="h-full bg-coral transition-all duration-500" style={{ width: `${completion}%` }} />
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div><label className="label">Full name <span className="text-coral">*</span></label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">Phone (WhatsApp) <span className="text-coral">*</span></label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" /></div>
            <div><label className="label">Years of experience <span className="text-coral">*</span></label>
              <input className="input" type="number" min={0} max={50} value={years}
                onChange={(e) => setYears(Number(e.target.value))} /></div>
          </div>
          <LocationPicker country={country} city={city} onCountry={setCountry} onCity={setCity} required />
          <div><label className="label">Professional headline <span className="text-coral">*</span></label>
            <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Chartered accountant · audit & reporting" /></div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-8">
          <div>
            <label className="label">Your niche — where you work <span className="text-coral">*</span></label>
            <div className="flex flex-wrap gap-2">
              {niches.map((n) => (
                <button key={n.id} type="button" className={chip(nicheId === n.id)}
                  onClick={() => setNicheId(n.id)}>{n.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Your career goal — where you&rsquo;re going <span className="text-coral">*</span></label>
            <div className="flex flex-wrap gap-2">
              {goals.map((g) => (
                <button key={g.id} type="button" className={chip(goalId === g.id)}
                  onClick={() => setGoalId(g.id)}>{g.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Areas of expertise — pick up to 6 <span className="text-coral">*</span></label>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <button key={s.id} type="button" className={chip(expertise.includes(s.id))}
                  onClick={() => toggleSkill(s.id)}>{s.label}</button>
              ))}
            </div>

            {/* Custom / typed skills for anything not in the list */}
            <div className="mt-4">
              <label className="label !text-xs">Don't see yours? Type it and press Add</label>
              <div className="flex gap-2">
                <input
                  className="input !h-10"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }}
                  placeholder="e.g. Solar installation, Yoruba copywriting…"
                  disabled={totalSkills() >= 6}
                />
                <button type="button" className="btn-ghost !h-10 shrink-0"
                  onClick={addCustomSkill} disabled={totalSkills() >= 6 || !skillInput.trim()}>+ Add</button>
              </div>
              {customSkills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {customSkills.map((s) => (
                    <span key={s} className="inline-flex items-center gap-2 bg-ink text-white rounded-pill px-3 py-1.5 text-sm font-semibold">
                      {s}
                      <button type="button" onClick={() => removeCustomSkill(s)} className="text-white/70 hover:text-white">✕</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-2 mt-2">
                {totalSkills()}/6 selected. {totalSkills() >= 6 ? "Remove one to add another." : "Mix from the list and your own."}
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          <div>
            <label className="label">Expected salary range ({currency}, monthly) <span className="text-coral">*</span></label>
            <div className="grid grid-cols-[1fr_1fr_120px] gap-3">
              <input className="input" type="number" placeholder="Min" value={salMin}
                onChange={(e) => setSalMin(e.target.value)} />
              <input className="input" type="number" placeholder="Max" value={salMax}
                onChange={(e) => setSalMax(e.target.value)} />
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>NGN</option><option>USD</option><option>GHS</option><option>KES</option><option>ZAR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Role level you&rsquo;re targeting <span className="text-coral">*</span></label>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button key={l} type="button" className={chip(level === l)}
                  onClick={() => setLevel(l)}>{l[0].toUpperCase() + l.slice(1)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Preferred work mode <span className="text-coral">*</span></label>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button key={m} type="button" className={chip(mode === m)}
                  onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Relocation</label>
            <div className="flex flex-wrap gap-2">
              {RELOC.map(([val, lab]) => (
                <button key={val} type="button" className={chip(reloc === val)}
                  onClick={() => setReloc(val)}>{lab}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <label className="label">Your resume — PDF or DOCX, max 10MB</label>
          <label className={`card flex flex-col items-center justify-center gap-3 p-10 cursor-pointer border-dashed transition hover:border-coral ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <input type="file" className="hidden" accept=".pdf,.docx"
              onChange={(e) => e.target.files?.[0] && uploadResume(e.target.files[0])} />
            <span className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl">↑</span>
            {resumeName ? (
              <>
                <span className="font-semibold text-sm">{resumeName}</span>
                <span className="text-muted text-xs">Click to replace</span>
              </>
            ) : (
              <>
                <span className="font-semibold text-sm">{uploading ? "Uploading & compressing…" : "Click to upload your resume"}</span>
                <span className="text-muted text-xs">We compress it automatically — quality kept, size cut</span>
              </>
            )}
          </label>
          <p className="text-muted text-xs mt-4">
            Your resume powers matching today and the Resume Review once you unlock the Career Toolkit.
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 mt-10">
        {step > 0 && (
          <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>← Back</button>
        )}
        {step < 3 ? (
          <button className="btn-coral" onClick={() => save(false)} disabled={busy || !!stepError(step)}>
            {busy ? "Saving…" : "Save & continue →"}
          </button>
        ) : (
          <button className="btn-coral" onClick={() => save(true)} disabled={busy || !!stepError(step)}>
            {busy ? "Saving…" : "Finish — take me to my dashboard →"}
          </button>
        )}
        {savedNote && !err && <span className="text-sm text-muted">{savedNote}</span>}
        {err && <span className="text-sm text-coral">{err}</span>}
      </div>
    </div>
  );
}
