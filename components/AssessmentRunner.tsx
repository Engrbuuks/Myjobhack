"use client";
import { useState, useEffect, useRef } from "react";

type Q = { id: string; type: "mcq" | "open" | "code"; prompt: string; options?: string[]; minutes: number };
type Current = { band: string; score: number; field: string; percentile?: number; assessed_at?: string };

const BAND_STYLE: Record<string, string> = {
  expert: "bg-ink text-white", strong: "bg-green-100 text-green-700",
  proficient: "bg-blue-100 text-blue-700", developing: "bg-coral-soft text-coral"
};

export function AssessmentRunner({ current, pendingId }: { current: Current | null; pendingId: string | null }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "taking" | "grading" | "done">("idle");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [asmtId, setAsmtId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const startTimes = useRef<Record<string, number>>({});
  const seconds = useRef<Record<string, number>>({});

  useEffect(() => {
    if (phase !== "taking" || remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => { if (r <= 1) { submit(); return 0; } return r - 1; }), 1000);
    return () => clearInterval(t);
  }, [phase, remaining]);

  async function generate() {
    setPhase("loading"); setErr(null);
    const res = await fetch("/api/assessment/generate", { method: "POST" });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Could not start."); setPhase("idle"); return; }
    setQuestions(json.questions); setAsmtId(json.id); setRemaining(json.time_limit_min * 60);
    setPhase("taking");
  }

  function setAnswer(qid: string, val: string) {
    if (!startTimes.current[qid]) startTimes.current[qid] = Date.now();
    setAnswers((a) => ({ ...a, [qid]: val }));
  }

  async function submit() {
    if (phase === "grading" || phase === "done") return;
    setPhase("grading");
    // finalize per-question seconds
    for (const q of questions) {
      if (startTimes.current[q.id]) seconds.current[q.id] = Math.round((Date.now() - startTimes.current[q.id]) / 1000);
    }
    const payload = questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? "", seconds_spent: seconds.current[q.id] ?? null }));
    const res = await fetch("/api/assessment/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessment_id: asmtId, answers: payload })
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Scoring failed."); setPhase("taking"); return; }
    setResult(json); setPhase("done");
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  // ----- DONE -----
  if (phase === "done" && result) {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="card p-6 text-center">
          <div className="text-sm text-muted-2 mb-2">Your result</div>
          <div className="text-5xl font-display font-semibold">{result.overall}<span className="text-2xl text-muted-2">/100</span></div>
          <span className={`inline-block mt-3 px-4 py-1.5 rounded-pill text-sm font-bold capitalize ${BAND_STYLE[result.band]}`}>{result.band}</span>
          {result.percentile != null && <div className="text-sm text-muted-2 mt-2">Top {100 - result.percentile}% in your field</div>}
          <p className="text-sm mt-4 text-muted-2">{result.message}</p>
        </div>
        {result.strengths?.length > 0 && (
          <div className="card p-5"><div className="font-semibold mb-2">Strengths</div>
            <ul className="text-sm space-y-1 text-muted-2">{result.strengths.map((s: string, i: number) => <li key={i}>✓ {s}</li>)}</ul></div>
        )}
        {result.gaps?.length > 0 && (
          <div className="card p-5">
            <div className="font-semibold mb-2">Where to improve</div>
            <ul className="text-sm space-y-1 text-muted-2">{result.gaps.map((g: string, i: number) => <li key={i}>→ {g}</li>)}</ul>
            <a href="/portal/seeker/ai-tools" className="btn-coral !h-10 text-sm mt-4 inline-flex">Build these skills in the Toolkit →</a>
          </div>
        )}
      </div>
    );
  }

  // ----- TAKING -----
  if (phase === "taking") {
    return (
      <div className="max-w-2xl">
        <div className="sticky top-0 bg-paper/95 backdrop-blur py-3 mb-4 flex items-center justify-between border-b border-line z-10">
          <span className="text-sm text-muted-2">{questions.length} questions</span>
          <span className={`font-mono font-bold text-lg ${remaining < 120 ? "text-coral" : ""}`}>{mm}:{ss}</span>
        </div>
        <div className="space-y-6">
          {questions.map((q, i) => (
            <div key={q.id} className="card p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-7 h-7 rounded-full bg-ink text-white grid place-items-center text-sm font-bold shrink-0">{i + 1}</span>
                <p className="font-medium whitespace-pre-wrap">{q.prompt}</p>
              </div>
              {q.type === "mcq" && q.options ? (
                <div className="space-y-2 pl-10">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`block px-4 py-2.5 rounded-xl border cursor-pointer text-sm transition ${answers[q.id] === opt ? "border-coral bg-coral-soft" : "border-line hover:border-ink"}`}>
                      <input type="radio" name={q.id} className="sr-only" checked={answers[q.id] === opt} onChange={() => setAnswer(q.id, opt)} />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea className="input !h-40 pl-10 font-mono text-sm w-full" placeholder="Your answer…"
                  value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
              )}
            </div>
          ))}
        </div>
        {err && <p className="text-coral text-sm mt-4">{err}</p>}
        <div className="sticky bottom-4 mt-6">
          <button className="btn-coral w-full !h-12" onClick={submit}>Submit for scoring</button>
        </div>
      </div>
    );
  }

  // ----- GRADING -----
  if (phase === "grading" || phase === "loading") {
    return (
      <div className="max-w-2xl card p-10 text-center">
        <div className="animate-pulse text-lg font-display">{phase === "loading" ? "Building your assessment…" : "Scoring your answers…"}</div>
        <p className="text-sm text-muted-2 mt-2">This takes a few seconds.</p>
      </div>
    );
  }

  // ----- IDLE -----
  return (
    <div className="max-w-2xl space-y-5">
      {current && (
        <div className="card p-6">
          <div className="text-sm text-muted-2 mb-1">Your current competency badge</div>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-1.5 rounded-pill text-sm font-bold capitalize ${BAND_STYLE[current.band]}`}>{current.band}</span>
            <span className="font-semibold">{current.score}/100</span>
            {current.percentile != null && <span className="text-sm text-muted-2">· top {100 - current.percentile}% in {current.field}</span>}
          </div>
        </div>
      )}
      <div className="card p-6">
        <h3 className="font-display font-semibold text-lg mb-2">{current ? "Retake your assessment" : "Take your competency assessment"}</h3>
        <p className="text-sm text-muted-2 mb-4">
          A practical, timed test generated for your field and level. Employers search competency-assessed candidates first — this is how you prove what you can do.
        </p>
        <ul className="text-sm text-muted-2 space-y-1 mb-5">
          <li>• Tailored to your title, niche and seniority</li>
          <li>• About 30–50 minutes, timed</li>
          <li>• Scored into a badge shown to employers</li>
        </ul>
        {err && <p className="text-coral text-sm mb-3">{err}</p>}
        <button className="btn-coral" onClick={generate}>{current ? "Retake assessment" : "Start assessment"} →</button>
      </div>
    </div>
  );
}
