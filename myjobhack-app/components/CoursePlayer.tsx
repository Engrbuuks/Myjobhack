"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Lesson = {
  id: string; title: string; lesson_type: string;
  content: any; duration_min: number | null; fileUrl?: string | null;
};
type Module = { id: string; title: string; lessons: Lesson[] };

export function CoursePlayer({ courseId, courseTitle, modules, doneIds }: {
  courseId: string; courseTitle: string; modules: Module[]; doneIds: string[];
}) {
  const router = useRouter();
  const flat = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const [done, setDone] = useState<Set<string>>(new Set(doneIds));
  const firstUndone = flat.find((l) => !done.has(l.id)) ?? flat[0];
  const [currentId, setCurrentId] = useState<string | null>(firstUndone?.id ?? null);
  const current = flat.find((l) => l.id === currentId) ?? null;
  const [celebrate, setCelebrate] = useState(false);
  const pct = flat.length ? Math.round((done.size / flat.length) * 100) : 0;

  async function markComplete(lessonId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("lesson_progress").upsert({ talent_id: user!.id, lesson_id: lessonId });
    const next = new Set(done); next.add(lessonId); setDone(next);

    if (next.size >= flat.length && flat.length > 0) {
      const res = await fetch("/api/lms/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId })
      });
      if (res.ok) { setCelebrate(true); router.refresh(); }
    } else {
      const idx = flat.findIndex((l) => l.id === lessonId);
      const nextLesson = flat.slice(idx + 1).find((l) => !next.has(l.id));
      if (nextLesson) setCurrentId(nextLesson.id);
    }
  }

  if (celebrate) {
    return (
      <div className="card p-10 text-center max-w-xl bg-ink text-white border-ink">
        <div className="w-14 h-14 rounded-full bg-coral grid place-items-center text-2xl mx-auto mb-5">✓</div>
        <div className="font-display font-semibold text-3xl mb-2">Course complete.</div>
        <p className="text-white/60 text-sm mb-6">
          Your certificate has been issued and this completion now strengthens your matching profile.
        </p>
        <a href="/portal/seeker/trainings" className="btn-coral">View certificate →</a>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
      {/* sidebar */}
      <div className="card p-5 lg:sticky lg:top-6">
        <div className="font-display font-semibold mb-1">{courseTitle}</div>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-1.5 flex-1 rounded-pill bg-paper-2 overflow-hidden">
            <div className="h-full bg-coral transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-bold">{pct}%</span>
        </div>
        {modules.map((m) => (
          <div key={m.id} className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1.5">{m.title}</div>
            {m.lessons.map((l) => (
              <button key={l.id} onClick={() => setCurrentId(l.id)}
                className={`flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-lg text-sm transition ${
                  currentId === l.id ? "bg-coral-soft text-coral font-semibold" : "hover:bg-paper"}`}>
                <span className={`w-4.5 h-4.5 w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold shrink-0 ${
                  done.has(l.id) ? "bg-ink text-white" : "border border-line text-muted"}`}>
                  {done.has(l.id) ? "✓" : ""}
                </span>
                <span className="flex-1 truncate">{l.title}</span>
                {l.duration_min && <span className="text-[10px] text-muted-2">{l.duration_min}m</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* content */}
      <div className="card p-6 min-h-96">
        {!current ? (
          <p className="text-sm text-muted">This course has no lessons yet.</p>
        ) : (
          <>
            <div className="font-display font-semibold text-2xl mb-5">{current.title}</div>
            <LessonContent lesson={current} onPass={() => markComplete(current.id)} passed={done.has(current.id)} />
            {current.lesson_type !== "quiz" && !done.has(current.id) && (
              <button className="btn-coral mt-6" onClick={() => markComplete(current.id)}>
                Mark complete & continue →
              </button>
            )}
            {done.has(current.id) && (
              <p className="text-sm text-muted mt-6">Completed ✓</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LessonContent({ lesson, onPass, passed }: { lesson: Lesson; onPass: () => void; passed: boolean }) {
  const c = lesson.content ?? {};
  if (lesson.lesson_type === "video") {
    const url: string = c.url ?? "";
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (yt) return (
      <div className="aspect-video rounded-xl overflow-hidden bg-ink">
        <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${yt[1]}`}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
    if (url) return <video className="w-full rounded-xl bg-ink" controls src={url} />;
    return <p className="text-sm text-muted">No video URL set.</p>;
  }
  if (lesson.lesson_type === "text")
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.html ?? ""}</p>;
  if (lesson.lesson_type === "link")
    return c.url ? (
      <a href={c.url} target="_blank" rel="noopener" className="btn-ghost">Open resource ↗</a>
    ) : <p className="text-sm text-muted">No link set.</p>;
  if (lesson.lesson_type === "file")
    return lesson.fileUrl ? (
      <a href={lesson.fileUrl} target="_blank" rel="noopener" className="btn-ghost">
        Download {c.filename ?? "file"} ↓
      </a>
    ) : <p className="text-sm text-muted">File unavailable.</p>;
  if (lesson.lesson_type === "quiz")
    return <Quiz questions={c.questions ?? []} onPass={onPass} passed={passed} />;
  return null;
}

function Quiz({ questions, onPass, passed }: {
  questions: { q: string; options: string[]; answer: number }[];
  onPass: () => void; passed: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<null | { correct: number; total: number; pass: boolean }>(null);

  function check() {
    const correct = questions.filter((q, i) => answers[i] === q.answer).length;
    const pass = correct === questions.length;
    setResult({ correct, total: questions.length, pass });
    if (pass && !passed) onPass();
  }

  if (questions.length === 0) return <p className="text-sm text-muted">No questions in this quiz yet.</p>;

  return (
    <div className="space-y-6">
      {questions.map((q, i) => (
        <div key={i}>
          <div className="font-semibold text-sm mb-2">{i + 1}. {q.q}</div>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o, x) => (
              <button key={x} type="button"
                className={`px-4 h-10 rounded-pill border text-sm font-semibold transition ${
                  answers[i] === x ? "bg-coral border-coral text-white" : "border-line hover:border-coral"}`}
                onClick={() => setAnswers((a) => ({ ...a, [i]: x }))}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn-coral" onClick={check}>Check answers</button>
      {result && (
        <p className={`text-sm font-semibold ${result.pass ? "text-ink" : "text-coral"}`}>
          {result.correct}/{result.total} correct — {result.pass ? "passed ✓ lesson complete" : "all answers must be correct to pass. Try again."}
        </p>
      )}
    </div>
  );
}
