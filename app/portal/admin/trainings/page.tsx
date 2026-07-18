import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { NewCourseButton } from "@/components/CourseBuilder";
import { DeleteButton } from "@/components/DeleteButton";

export default async function AdminTrainings() {
  const supabase = createClient();
  const [{ data: trainings }, { data: courses }, { data: enrolls }] = await Promise.all([
    supabase.from("trainings").select("id, title, delivery, status, starts_at, location_or_link, course_id")
      .order("created_at", { ascending: false }),
    supabase.from("courses").select("id, title, status, created_at").order("created_at", { ascending: false }),
    supabase.from("enrollments").select("training_id")
  ]);
  const counts = new Map<string, number>();
  (enrolls ?? []).forEach((e) => counts.set(e.training_id, (counts.get(e.training_id) ?? 0) + 1));

  return (
    <>
      <PageHeader title="Trainings"
        sub="External sessions and LMS courses. The invite engine fills them; this is where you run them."
        action={<span className="flex gap-3"><Link href="/portal/admin/trainings/new" className="btn-coral">＋ Curate training</Link><Link href="/portal/admin/invites" className="btn-ghost">Send invites ✉</Link></span>} />

      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">All trainings</div>
          {(trainings ?? []).length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted">Create your first training from the invite engine.</div>
          ) : (
            <div className="space-y-3">
              {(trainings ?? []).map((t) => (
                <Link key={t.id} href={`/portal/admin/trainings/${t.id}`}
                  className="card p-5 flex items-center gap-4 hover:border-coral transition">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{t.title}</div>
                    <div className="text-xs text-muted-2">
                      {t.delivery === "lms" ? "LMS course" : "External"} ·{" "}
                      {t.starts_at ? new Date(t.starts_at).toLocaleString() : "no date"} · {t.status.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-display font-semibold text-xl">{counts.get(t.id) ?? 0}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Enrolled</div>
                  </div>
                  <span className="text-coral font-semibold text-sm">Manage →</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold uppercase tracking-widest text-muted">LMS courses</div>
            <NewCourseButton />
          </div>
          {(courses ?? []).length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted">
              No courses yet — build one and attach it to any training with delivery “LMS”.
            </div>
          ) : (
            <div className="space-y-3">
              {(courses ?? []).map((c) => (
                <div key={c.id} className="card p-5 flex items-center gap-4 hover:border-coral transition">
                  <Link href={`/portal/admin/courses/${c.id}`} className="flex-1">
                    <div className="font-semibold text-sm">{c.title}</div>
                    <div className="text-xs text-muted-2 capitalize">{c.status.replace(/_/g, " ")}</div>
                  </Link>
                  <DeleteButton action="delete_course" id={c.id} label="✕" confirmLabel="Delete" small />
                  <Link href={`/portal/admin/courses/${c.id}`} className="text-coral font-semibold text-sm">Build →</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
