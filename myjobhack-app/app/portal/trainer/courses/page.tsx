import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function TrainerCourses() {
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: courses } = await admin.from("courses")
    .select("id, title, slug, description, status, created_at, created_by")
    .order("created_at", { ascending: false });

  // module + lesson counts per course
  const enriched = await Promise.all((courses ?? []).map(async (c) => {
    const { count: modules } = await admin.from("course_modules")
      .select("id", { count: "exact", head: true }).eq("course_id", c.id);
    const { data: mods } = await admin.from("course_modules").select("id").eq("course_id", c.id);
    let lessons = 0;
    if ((mods ?? []).length) {
      const { count } = await admin.from("lessons")
        .select("id", { count: "exact", head: true }).in("module_id", (mods ?? []).map((m) => m.id));
      lessons = count ?? 0;
    }
    return { ...c, modules: modules ?? 0, lessons, mine: c.created_by === user!.id };
  }));

  return (
    <>
      <PageHeader title="LMS courses"
        sub="Structured learning that raises a candidate's competency band — the improvement layer of the platform." />

      {enriched.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-muted mb-1">No courses yet.</p>
          <p className="text-xs text-muted-2">Courses are created by admins and assigned to trainers to deliver.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-48">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.title}</span>
                    {c.mine && <span className="px-2 py-0.5 rounded-pill bg-coral-soft text-coral text-[10px] font-bold uppercase">Mine</span>}
                  </div>
                  {c.description && <p className="text-sm text-muted-2 mt-1 line-clamp-2">{c.description}</p>}
                  <div className="text-xs text-muted-2 mt-2">
                    {c.modules} module{c.modules === 1 ? "" : "s"} · {c.lessons} lesson{c.lessons === 1 ? "" : "s"}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
                  c.status === "open" || c.status === "in_progress" ? "bg-ink text-white" : "bg-paper-2 text-muted"}`}>
                  {String(c.status).replace("_", " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
