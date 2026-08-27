"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DeleteButton } from "@/components/DeleteButton";

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

const TYPE_META: Record<string, { icon: string; tint: string }> = {
  video: { icon: "▶", tint: "bg-coral-soft text-coral" },
  text:  { icon: "¶", tint: "bg-paper-2 text-ink" },
  link:  { icon: "↗", tint: "bg-paper-2 text-ink" },
  file:  { icon: "⬇", tint: "bg-paper-2 text-ink" },
  quiz:  { icon: "?", tint: "bg-ink text-white" }
};

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
  const [selected, setSelected] = useState<{ m: string; l: string } | null>(() => {
    const m0 = initialModules[0];
    return m0?.lessons[0] ? { m: m0.id, l: m0.lessons[0].id } : null;
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const totals = useMemo(() => {
    const lessons = modules.flatMap((m) => m.lessons);
    const mins = lessons.reduce((a, l) => a + (l.duration_min ?? 0), 0);
    return { modules: modules.length, lessons: lessons.length, mins };
  }, [modules]);

  const current = useMemo(() => {
    if (!selected) return null;
    const mod = modules.find((m) => m.id === selected.m);
    const les = mod?.lessons.find((l) => l.id === selected.l);
    return mod && les ? { mod, les } : null;
  }, [modules, selected]);

  async function persist(fn: () => Promise<any>) {
    setSaving(true);
    await fn();
    setSaving(false); setSavedAt(new Date());
  }

  // ----- course meta -----
  const saveMeta = () => persist(async () => {
    await supabase.from("courses").update({ title, description, status: status as any }).eq("id", course.id);
    router.refresh();
  });

  // ----- modules -----
  const addModule = () => persist(async () => {
    const { data } = await supabase.from("course_modules")
      .insert({ course_id: course.id, sort: modules.length, title: `Module ${modules.length + 1}` })
      .select("id, sort, title").single();
    if (data) setModules((m) => [...m, { ...data, lessons: [] }]);
  });
  const renameModule = (id: string, t: string) => {
    setModules((m) => m.map((x) => (x.id === id ? { ...x, title: t } : x)));
    persist(async () => supabase.from("course_modules").update({ title: t }).eq("id", id));
  };
  const deleteModule = (id: string) => persist(async () => {
    await supabase.from("course_modules").delete().eq("id", id);
    setModules((m) => m.filter((x) => x.id !== id));
    if (selected?.m === id) setSelected(null);
  });
  const moveModule = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= modules.length) return;
    const next = [...modules];
    [next[i], next[t]] = [next[t], next[i]];
    setModules(next);
    persist(async () => {
      await supabase.from("course_modules").update({ sort: t }).eq("id", next[t].id);
      await supabase.from("course_modules").update({ sort: i }).eq("id", next[i].id);
    });
  };

  // ----- lessons -----
  const addLesson = (moduleId: string, type: string) => persist(async () => {
    const mod = modules.find((m) => m.id === moduleId)!;
    const { data } = await supabase.from("lessons").insert({
      module_id: moduleId, sort: mod.lessons.length, title: `New ${type} lesson`,
      lesson_type: type as any, content: type === "quiz" ? { questions: [] } : {}
    }).select("*").single();
    if (data) {
      setModules((m) => m.map((x) => (x.id === moduleId ? { ...x, lessons: [...x.lessons, data as any] } : x)));
      setSelected({ m: moduleId, l: data.id });
    }
  });
  const updateLesson = (moduleId: string, lessonId: string, patch: Partial<Lesson>) => {
    setModules((m) => m.map((x) => x.id === moduleId
      ? { ...x, lessons: x.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)) } : x));
    persist(async () => supabase.from("lessons").update(patch as any).eq("id", lessonId));
  };
  const deleteLesson = (moduleId: string, lessonId: string) => persist(async () => {
    await supabase.from("lessons").delete().eq("id", lessonId);
    setModules((m) => m.map((x) => x.id === moduleId
      ? { ...x, lessons: x.lessons.filter((l) => l.id !== lessonId) } : x));
    if (selected?.l === lessonId) setSelected(null);
  });
  const moveLesson = (moduleId: string, i: number, dir: -1 | 1) => {
    const mod = modules.find((m) => m.id === moduleId)!;
    const t = i + dir;
    if (t < 0 || t >= mod.lessons.length) return;
    const lessons = [...mod.lessons];
    [lessons[i], lessons[t]] = [lessons[t], lessons[i]];
    setModules((m) => m.map((x) => (x.id === moduleId ? { ...x, lessons } : x)));
    persist(async () => {
      await supabase.from("lessons").update({ sort: t }).eq("id", lessons[t].id);
      await supabase.from("lessons").update({ sort: i }).eq("id", lessons[i].id);
    });
  };

  async function uploadLessonFile(moduleId: string, lesson: Lesson, file: File) {
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "other");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (res.ok) updateLesson(moduleId, lesson.id, {
      content: { ...lesson.content, document_id: json.document.id, filename: file.name }
    });
  }

  const toggleCollapse = (id: string) => setCollapsed((c) => {
    const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <div>
      {/* ---- studio header ---- */}
      <div className="relative overflow-hidden rounded-card bg-ink text-white px-7 py-6 mb-6 border border-ink">
        <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-coral/[.15] blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <input
            className="flex-1 min-w-64 bg-transparent font-display font-semibold text-2xl outline-none placeholder:text-white/30 border-b border-transparent focus:border-coral/50 transition pb-1"
            value={title} placeholder="Course title…"
            onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} />
          <div className="flex items-center gap-5 text-center">
            {[["Modules", totals.modules], ["Lessons", totals.lessons], ["Minutes", totals.mins]].map(([l, v]) => (
              <div key={l as string}>
                <div className="font-display font-semibold text-2xl leading-none">{v}</div>
                <div className="text-[9px] font-extrabold uppercase tracking-[.2em] text-white/45 mt-1">{l}</div>
              </div>
            ))}
          </div>
          <select
            className={`h-10 px-4 rounded-pill text-xs font-bold outline-none cursor-pointer ${
              status === "open" ? "bg-coral text-white" : "bg-white/10 text-white"}`}
            value={status} onChange={(e) => { setStatus(e.target.value); }} onBlur={saveMeta}>
            <option value="draft" className="text-ink">● Draft</option>
            <option value="open" className="text-ink">● Live</option>
            <option value="completed" className="text-ink">● Retired</option>
          </select>
        </div>
        <div className="relative flex items-center gap-4 mt-3">
          <input
            className="flex-1 bg-transparent text-sm text-white/60 outline-none placeholder:text-white/25"
            value={description} placeholder="One line on what this course delivers…"
            onChange={(e) => setDescription(e.target.value)} onBlur={saveMeta} />
          <span className="text-[11px] text-white/35 whitespace-nowrap">
            {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ✓` : "Autosaves as you work"}
          </span>
          <DeleteButton action="delete_course" id={course.id} label="Delete" confirmLabel="Delete course" redirect="/portal/admin/trainings" small />
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* ---- structure tree ---- */}
        <div className="card p-4 lg:sticky lg:top-6 max-h-[75vh] overflow-y-auto">
          {modules.length === 0 && (
            <p className="text-sm text-muted-2 px-2 py-4">Start with a module — then stack lessons inside it.</p>
          )}
          {modules.map((mod, mi) => (
            <div key={mod.id} className="mb-2">
              <div className="flex items-center gap-1.5 group px-1">
                <button className="w-5 text-muted text-xs" onClick={() => toggleCollapse(mod.id)}>
                  {collapsed.has(mod.id) ? "▸" : "▾"}
                </button>
                <input className="flex-1 bg-transparent text-sm font-bold outline-none border-b border-transparent focus:border-coral/40 transition py-1.5"
                  value={mod.title} onChange={(e) => renameModule(mod.id, e.target.value)} />
                <span className="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                  <button className="w-6 h-6 grid place-items-center text-muted hover:text-ink text-xs" onClick={() => moveModule(mi, -1)}>↑</button>
                  <button className="w-6 h-6 grid place-items-center text-muted hover:text-ink text-xs" onClick={() => moveModule(mi, 1)}>↓</button>
                  <button className="w-6 h-6 grid place-items-center text-muted hover:text-coral text-xs" onClick={() => deleteModule(mod.id)}>✕</button>
                </span>
              </div>

              {!collapsed.has(mod.id) && (
                <div className="ml-3 pl-3 border-l border-line">
                  {mod.lessons.map((l, li) => {
                    const meta = TYPE_META[l.lesson_type] ?? TYPE_META.text;
                    const active = selected?.l === l.id;
                    return (
                      <div key={l.id} className="group flex items-center gap-1">
                        <button onClick={() => setSelected({ m: mod.id, l: l.id })}
                          className={`flex-1 flex items-center gap-2.5 px-2 py-2 my-0.5 rounded-lg text-left transition ${
                            active ? "bg-coral-soft" : "hover:bg-paper"}`}>
                          <span className={`w-6 h-6 rounded-lg grid place-items-center text-[11px] font-bold shrink-0 ${meta.tint}`}>{meta.icon}</span>
                          <span className={`text-sm truncate flex-1 ${active ? "font-semibold text-coral" : ""}`}>{l.title}</span>
                          {l.duration_min ? <span className="text-[10px] text-muted-2">{l.duration_min}m</span> : null}
                        </button>
                        <span className="opacity-0 group-hover:opacity-100 transition flex flex-col">
                          <button className="text-muted hover:text-ink text-[10px] leading-3" onClick={() => moveLesson(mod.id, li, -1)}>▲</button>
                          <button className="text-muted hover:text-ink text-[10px] leading-3" onClick={() => moveLesson(mod.id, li, 1)}>▼</button>
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-1.5 py-2">
                    {Object.keys(TYPE_META).map((t) => (
                      <button key={t} onClick={() => addLesson(mod.id, t)}
                        className="px-2.5 h-7 rounded-pill border border-line text-[11px] font-semibold text-muted hover:border-coral hover:text-coral transition">
                        ＋ {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button className="btn-coral !h-10 w-full justify-center mt-2" onClick={addModule}>＋ Add module</button>
        </div>

        {/* ---- lesson editor ---- */}
        <div className="card p-6 min-h-96">
          {!current ? (
            <div className="h-72 grid place-items-center text-center">
              <div>
                <div className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mx-auto mb-4">✎</div>
                <p className="text-sm text-muted max-w-xs">Pick a lesson from the structure — or add one — and edit it here.</p>
              </div>
            </div>
          ) : (
            <LessonEditor key={current.les.id} lesson={current.les} moduleTitle={current.mod.title}
              onChange={(patch) => updateLesson(current.mod.id, current.les.id, patch)}
              onDelete={() => deleteLesson(current.mod.id, current.les.id)}
              onFile={(f) => uploadLessonFile(current.mod.id, current.les, f)} />
          )}
        </div>
      </div>
    </div>
  );
}

function LessonEditor({ lesson, moduleTitle, onChange, onDelete, onFile }: {
  lesson: Lesson; moduleTitle: string;
  onChange: (patch: Partial<Lesson>) => void;
  onDelete: () => void;
  onFile: (f: File) => void;
}) {
  const c = lesson.content ?? {};
  const meta = TYPE_META[lesson.lesson_type] ?? TYPE_META.text;
  const setContent = (patch: any) => onChange({ content: { ...c, ...patch } });
  const yt = (c.url ?? "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className={`w-9 h-9 rounded-xl grid place-items-center text-sm font-bold ${meta.tint}`}>{meta.icon}</span>
        <div className="flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-[.2em] text-muted">{moduleTitle} · {lesson.lesson_type}</div>
          <input className="w-full bg-transparent font-display font-semibold text-xl outline-none border-b border-transparent focus:border-coral/40 transition"
            value={lesson.title} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="text-right">
          <label className="label !mb-1">Minutes</label>
          <input className="input !h-9 !w-20 text-center" type="number" value={lesson.duration_min ?? ""}
            onChange={(e) => onChange({ duration_min: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <button className="text-muted hover:text-coral text-sm self-start" onClick={onDelete}>✕</button>
      </div>

      {lesson.lesson_type === "video" && (
        <>
          <label className="label">Video URL — YouTube or direct .mp4</label>
          <input className="input mb-4" placeholder="https://youtube.com/watch?v=…"
            value={c.url ?? ""} onChange={(e) => setContent({ url: e.target.value })} />
          {yt ? (
            <div className="aspect-video rounded-xl overflow-hidden bg-ink">
              <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${yt[1]}`} allowFullScreen />
            </div>
          ) : c.url ? (
            <video className="w-full rounded-xl bg-ink" controls src={c.url} />
          ) : (
            <div className="aspect-video rounded-xl bg-paper grid place-items-center text-sm text-muted-2">
              Live preview appears as soon as you paste a URL
            </div>
          )}
        </>
      )}
      {lesson.lesson_type === "text" && (
        <>
          <label className="label">Lesson content</label>
          <textarea className="input !h-auto py-3" rows={14} placeholder="Write the lesson…"
            value={c.html ?? ""} onChange={(e) => setContent({ html: e.target.value })} />
          <div className="text-xs text-muted-2 mt-2">{(c.html ?? "").length.toLocaleString()} characters</div>
        </>
      )}
      {lesson.lesson_type === "link" && (
        <>
          <label className="label">External resource URL</label>
          <input className="input" placeholder="https://…" value={c.url ?? ""} onChange={(e) => setContent({ url: e.target.value })} />
          {c.url && <a href={c.url} target="_blank" rel="noopener" className="btn-ghost !h-10 mt-4">Test the link ↗</a>}
        </>
      )}
      {lesson.lesson_type === "file" && (
        <label className="card border-dashed flex flex-col items-center gap-3 p-10 cursor-pointer hover:border-coral transition">
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <span className="w-12 h-12 rounded-full bg-coral-soft text-coral grid place-items-center text-xl">↑</span>
          <span className="text-sm font-medium">{c.filename ?? "Upload the lesson file"}</span>
          <span className="text-xs text-muted-2">Compressed automatically · PDF, DOCX, images</span>
        </label>
      )}
      {lesson.lesson_type === "quiz" && (
        <QuizBuilder questions={c.questions ?? []} onChange={(q) => setContent({ questions: q })} />
      )}
    </div>
  );
}

type Q = { q: string; options: string[]; answer: number };
function QuizBuilder({ questions, onChange }: { questions: Q[]; onChange: (q: Q[]) => void }) {
  const upd = (i: number, patch: Partial<Q>) =>
    onChange(questions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-2 -mt-1">Learners must get every question right to pass — click an option's dot to mark it correct.</p>
      {questions.map((q, i) => (
        <div key={i} className="rounded-xl border border-line p-4">
          <div className="flex gap-2 mb-3">
            <span className="w-7 h-7 rounded-full bg-ink text-white grid place-items-center text-xs font-bold shrink-0">{i + 1}</span>
            <input className="input !h-9 flex-1" placeholder="Question…"
              value={q.q} onChange={(e) => upd(i, { q: e.target.value })} />
            <button className="text-muted hover:text-coral" onClick={() => onChange(questions.filter((_, x) => x !== i))}>✕</button>
          </div>
          <div className="space-y-2 ml-9">
            {q.options.map((o, x) => (
              <div key={x} className="flex items-center gap-2">
                <button type="button" title="Mark correct"
                  className={`w-5 h-5 rounded-full border-2 grid place-items-center transition ${
                    q.answer === x ? "border-coral bg-coral" : "border-line hover:border-coral"}`}
                  onClick={() => upd(i, { answer: x })}>
                  {q.answer === x && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </button>
                <input className={`input !h-9 flex-1 ${q.answer === x ? "!border-coral" : ""}`}
                  placeholder={`Option ${x + 1}`}
                  value={o} onChange={(e) => upd(i, { options: q.options.map((y, yi) => yi === x ? e.target.value : y) })} />
                {q.options.length > 2 && (
                  <button className="text-muted hover:text-coral text-xs"
                    onClick={() => upd(i, { options: q.options.filter((_, yi) => yi !== x), answer: q.answer >= x && q.answer > 0 ? q.answer - 1 : q.answer })}>✕</button>
                )}
              </div>
            ))}
            <button className="text-xs font-semibold text-muted hover:text-coral transition"
              onClick={() => upd(i, { options: [...q.options, ""] })}>＋ option</button>
          </div>
        </div>
      ))}
      <button className="btn-coral !h-10"
        onClick={() => onChange([...questions, { q: "", options: ["", ""], answer: 0 }])}>
        ＋ Add question
      </button>
    </div>
  );
}
