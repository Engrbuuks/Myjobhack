"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Q = { id: string; type: string; prompt: string; options?: string[]; minutes?: number; max_points?: number };

export function SingleAssessmentRunner({ assessmentId, alreadyDone }: { assessmentId: string; alreadyDone: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "taking" | "grading" | "done">(alreadyDone ? "done" : "intro");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const seconds = useRef<Record<string, number>>({});
  const startTimes = useRef<Record<string, number>>({});

  // ---- Integrity signals (detection aid, not proof) ----
  const integrity = useRef({
    paste_events: 0, paste_chars: 0,
    focus_losses: 0, focus_lost_seconds: 0,
    per_question: {} as Record<string, { seconds: number; chars: number; bursts: number }>,
    total_seconds: 0
  });
  const lastKeyAt = useRef<Record<string, number>>({});
  const blurAt = useRef<number | null>(null);
  const sittingStart = useRef<number>(0);

  // Track leaving the page — a second device or another tab is the usual reason.
  useEffect(() => {
    if (phase !== "taking") return;
    function onBlur() { blurAt.current = Date.now(); }
    function onFocus() {
      if (blurAt.current) {
        integrity.current.focus_losses += 1;
        integrity.current.focus_lost_seconds += (Date.now() - blurAt.current) / 1000;
        blurAt.current = null;
      }
    }
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); };
  }, [phase]);

  function notePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData?.getData("text") ?? "";
    integrity.current.paste_events += 1;
    integrity.current.paste_chars += text.length;
  }

  // A "burst" is a run of typing with no pause longer than 2.5s.
  function noteTyping(qid: string, value: string) {
    const now = Date.now();
    const rec = integrity.current.per_question[qid] ?? { seconds: 0, chars: 0, bursts: 0 };
    const last = lastKeyAt.current[qid];
    if (!last || now - last > 2500) rec.bursts += 1;
    lastKeyAt.current[qid] = now;
    rec.chars = value.length;
    integrity.current.per_question[qid] = rec;
  }

  useEffect(() => {
    if (phase !== "taking") return;
    const t = setInterval(() => setRemaining((r) => { if (r <= 1) { submit(); return 0; } return r - 1; }), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function start() {
    setErr(null);
    const res = await fetch("/api/assessment/load", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessment_id: assessmentId })
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Could not load assessment."); return; }
    setQuestions(json.questions); setRemaining(json.time_limit_min * 60);
    sittingStart.current = Date.now();
    json.questions.forEach((q: Q) => { startTimes.current[q.id] = Date.now(); });
    setPhase("taking");
  }

  async function submit() {
    if (phase === "grading" || phase === "done") return;
    setPhase("grading");
    for (const q of questions) {
      if (startTimes.current[q.id]) seconds.current[q.id] = Math.round((Date.now() - startTimes.current[q.id]) / 1000);
      const rec = integrity.current.per_question[q.id] ?? { seconds: 0, chars: (answers[q.id] ?? "").length, bursts: 1 };
      rec.seconds = seconds.current[q.id] ?? 0;
      integrity.current.per_question[q.id] = rec;
    }
    integrity.current.total_seconds = Math.round((Date.now() - sittingStart.current) / 1000);
    const payload = questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? "", seconds_spent: seconds.current[q.id] ?? null }));
    const res = await fetch("/api/assessment/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessment_id: assessmentId, answers: payload, integrity: integrity.current })
    });
    const json = await res.json();
    if (!res.ok) { setErr(json.error ?? "Scoring failed."); setPhase("taking"); return; }
    setResult(json); setPhase("done");
  }

  if (phase === "done") return (
    <div className="card p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-coral text-white grid place-items-center text-2xl mx-auto mb-4">✓</div>
      <h3 className="font-display font-semibold text-xl mb-2">Assessment submitted</h3>
      <p className="text-muted-2 text-sm mb-4">Thank you — your responses have been recorded. The employer will see your scored result.</p>
      <button className="btn-ghost" onClick={() => router.push("/portal/seeker/assessment")}>Back to assessments</button>
    </div>
  );

  if (phase === "intro") return (
    <div className="card p-8">
      <h3 className="font-display font-semibold text-xl mb-2">Ready when you are</h3>
      <p className="text-muted-2 text-sm mb-4">This assessment is tailored to a specific role you've been shortlisted for. Once you start, a timer begins. Answer thoughtfully — this is how you prove you can do the job.</p>
      {err && <p className="text-coral text-sm mb-3">{err}</p>}
      <button className="btn-coral" onClick={start}>Start assessment →</button>
    </div>
  );

  if (phase === "grading") return (
    <div className="card p-8 text-center"><p className="text-muted-2">Submitting your responses…</p></div>
  );

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return (
    <div className="space-y-4">
      <div className="sticky top-0 bg-paper z-10 py-2 flex items-center justify-between">
        <span className="text-sm text-muted-2">{questions.length} questions</span>
        <span className={`font-display font-semibold ${remaining < 120 ? "text-coral" : "text-ink"}`}>{mm}:{ss}</span>
      </div>
      {err && <p className="text-coral text-sm">{err}</p>}
      {questions.map((q, i) => (
        <div key={q.id} className="card p-5">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-2 mb-2">Question {i + 1}{q.max_points ? ` · ${q.max_points} pts` : ""}</div>
          <p className="font-medium mb-3">{q.prompt}</p>
          {q.type === "mcq" && q.options ? (
            <div className="space-y-2">
              {q.options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name={q.id} className="accent-[#FC5647]" checked={answers[q.id] === opt}
                    onChange={() => setAnswers({ ...answers, [q.id]: opt })} /> {opt}
                </label>
              ))}
            </div>
          ) : (
            <textarea className="input !h-auto py-2" rows={q.type === "code" ? 8 : 4}
              value={answers[q.id] ?? ""}
              onPaste={notePaste}
              onChange={(e) => { noteTyping(q.id, e.target.value); setAnswers({ ...answers, [q.id]: e.target.value }); }}
              placeholder={q.type === "code" ? "Write your solution…" : "Your answer…"} />
          )}
        </div>
      ))}
      <button className="btn-coral w-full justify-center" onClick={submit}>Submit assessment</button>
    </div>
  );
}
