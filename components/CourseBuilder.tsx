"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewCourseButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const slug = `course-${Date.now()}`;
    const { data, error } = await supabase.from("courses")
      .insert({ title: "Untitled course", slug, created_by: user!.id }).select("id").single();
    setBusy(false);
    if (!error && data) router.push(`/portal/admin/courses/${data.id}`);
  }
  return <button className="btn-ghost !h-9 text-xs" onClick={create} disabled={busy}>＋ New course</button>;
}

type Lesson = { id: string; sort: number; title: string; lesson_type: string; content: any; duration_min: number | null };
type Module = { id: string; sort: number; title: string; lessons: Lesson[] };

export function CourseBuilder({ course, modules: initialModules }: {
  course: { id: string; title: string; description: string; status: string };
  modules: Module[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [status, setStatus] = useState(course.status);
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function saveMeta() {
    setBusy(true); setNote(null);
    const { error } = await supabase.from("courses")
      .update({ title, description, status: status as any }).eq("id", course.id);
    setBusy(false); setNote(error ? error.message : "Saved ✓");
    router.refresh();
  }

  async function addModule() {
    const { data, error } = await supabase.from("course_modules")
      .insert({ course_id: course.id, sort: modules.length, title: `Module ${modules.length + 1}` })
      .select("id, sort, title").single();
    if (!error && data) setModules((m) => [...m, { ...data, lessons: [] }]);
  }
  async function renameModule(id: string, t: string) {
    setModules((m) => m.map((x) => (x.id === id ? { ...x, title: t } : x)));
    await supabase.from("course_modules").update({ title: t }).eq("id", id);
  }
  async function deleteModule(id: string) {
    await supabase.from("course_modules").delete().eq("id", id);
    setModules((m) => m.filter((x) => x.id !== id));
  }

  async function addLesson(moduleId: string, type: string) {
    const mod = modules.find((m) => m.id === moduleId)!;
    const { data, error } = await supabase.from("lessons").insert({
      module_id: moduleId, sort: mod.lessons.length, title: "New lesson",
      lesson_type: type as any, content: type === "quiz" ? { questions: [] } : {}
    }).select("*").single();
    if (!error && data)
      setModules((m) => m.map((x) => (x.id === moduleId ? { ...x, lessons: [...x.lessons, data as any] } : x)));
  }
  async function updateLesson(moduleId: string, lessonId: string, patch: Partial<Lesson>) {
    setModules((m) => m.map((x) => x.id === moduleId
      ? { ...x, lessons: x.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)) } : x));
    await supabase.from("lessons").update(patch as any).eq("id", lessonId);
  }
  async function deleteLesson(moduleId: string, lessonId: string) {
    await supabase.from("lessons").delete().eq("id", lessonId);
    setModules((m) => m.map((x) => x.id === moduleId
      ? { ...x, lessons: x.lessons.filter((l) => l.id !== lessonId) } : x));
  }

  async function uploadLessonFile(moduleId: string, lesson: Lesson, file: File) {
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "other");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (res.ok) updateLesson(moduleId, lesson.id, {
      content: { ...lesson.content, document_id: json.document.id, filename: file.name }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-6">
        <div className="grid sm:grid-cols-[1fr_150px] gap-4 mb-4">
          <div><label className="label">Course title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">draft</option>
              <option value="open">open (published)</option>
              <option value="completed">completed</option>
            </select></div>
        </div>
        <label className="label">Description</label>
        <textarea className="input !h-auto py-3 mb-4" rows={3}
          value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex items-center gap-4">
          <button className="btn-coral" onClick={saveMeta} disabled={busy}>Save course</button>
          {note && <span className="text-sm text-muted">{note}</span>}
        </div>
      </div>

      {modules.map((mod) => (
        <div key={mod.id} className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <input className="input !h-10 font-semibold" value={mod.title}
              onChange={(e) => renameModule(mod.id, e.target.value)} />
            <button className="text-muted hover:text-coral" onClick={() => deleteModule(mod.id)}>✕</button>
          </div>
          <div className="space-y-3">
            {mod.lessons.map((l) => (
              <LessonEditor key={l.id} lesson={l}
                onChange={(patch) => updateLesson(mod.id, l.id, patch)}
                onDelete={() => deleteLesson(mod.id, l.id)}
                onFile={(f) => uploadLessonFile(mod.id, l, f)} />
            ))}
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {["video", "text", "link", "file", "quiz"].map((t) => (
              <button key={t} className="btn-ghost !h-9 text-xs" onClick={() => addLesson(mod.id, t)}>
                ＋ {t}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button className="btn-coral" onClick={addModule}>＋ Add module</button>
    </div>
  );
}

function LessonEditor({ lesson, onChange, onDelete, onFile }: {
  lesson: Lesson;
  onChange: (patch: Partial<Lesson>) => void;
  onDelete: () => void;
  onFile: (f: File) => void;
}) {
  const c = lesson.content ?? {};
  const setContent = (patch: any) => onChange({ content: { ...c, ...patch } });

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="px-2 py-1 rounded-pill bg-paper-2 text-muted text-[10px] font-bold uppercase tracking-widest">
          {lesson.lesson_type}
        </span>
        <input className="input !h-9 flex-1" value={lesson.title}
          onChange={(e) => onChange({ title: e.target.value })} />
        <input className="input !h-9 !w-20" type="number" placeholder="min"
          value={lesson.duration_min ?? ""} onChange={(e) => onChange({ duration_min: e.target.value ? Number(e.target.value) : null })} />
        <button className="text-muted hover:text-coral" onClick={onDelete}>✕</button>
      </div>

      {lesson.lesson_type === "video" && (
        <input className="input !h-10" placeholder="Video URL — YouTube link or direct .mp4"
          value={c.url ?? ""} onChange={(e) => setContent({ url: e.target.value })} />)}
      {lesson.lesson_type === "link" && (
        <input className="input !h-10" placeholder="External URL"
          value={c.url ?? ""} onChange={(e) => setContent({ url: e.target.value })} />)}
      {lesson.lesson_type === "text" && (
        <textarea className="input !h-auto py-3" rows={5} placeholder="Lesson content…"
          value={c.html ?? ""} onChange={(e) => setContent({ html: e.target.value })} />)}
      {lesson.lesson_type === "file" && (
        <label className="card border-dashed flex items-center gap-3 p-3 cursor-pointer hover:border-coral transition">
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <span className="w-8 h-8 rounded-full bg-coral-soft text-coral grid place-items-center">↑</span>
          <span className="text-sm">{c.filename ?? "Upload lesson file (compressed automatically)"}</span>
        </label>)}
      {lesson.lesson_type === "quiz" && (
        <QuizBuilder questions={c.questions ?? []} onChange={(q) => setContent({ questions: q })} />)}
    </div>
  );
}

type Q = { q: string; options: string[]; answer: number };
function QuizBuilder({ questions, onChange }: { questions: Q[]; onChange: (q: Q[]) => void }) {
  const upd = (i: number, patch: Partial<Q>) =>
    onChange(questions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <div key={i} className="rounded-lg bg-paper p-3">
          <div className="flex gap-2 mb-2">
            <input className="input !h-9 flex-1" placeholder={`Question ${i + 1}`}
              value={q.q} onChange={(e) => upd(i, { q: e.target.value })} />
            <button className="text-muted hover:text-coral"
              onClick={() => onChange(questions.filter((_, x) => x !== i))}>✕</button>
          </div>
          <input className="input !h-9 mb-2" placeholder="Options, comma separated"
            value={q.options.join(", ")}
            onChange={(e) => upd(i, { options: e.target.value.split(",").map((s) => s.trim()) })} />
          <select className="input !h-9 !w-auto text-sm" value={q.answer}
            onChange={(e) => upd(i, { answer: Number(e.target.value) })}>
            {q.options.map((o, x) => <option key={x} value={x}>Correct: {o || `option ${x + 1}`}</option>)}
          </select>
        </div>
      ))}
      <button className="btn-ghost !h-9 text-xs"
        onClick={() => onChange([...questions, { q: "", options: ["", ""], answer: 0 }])}>
        ＋ Add question
      </button>
    </div>
  );
}
