import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CourseBuilder } from "@/components/CourseBuilder";

export default async function CoursePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: course }, { data: mods }, { data: lessons }] = await Promise.all([
    supabase.from("courses").select("id, title, description, status").eq("id", params.id).single(),
    supabase.from("course_modules").select("id, sort, title").eq("course_id", params.id).order("sort"),
    supabase.from("lessons").select("*").order("sort")
  ]);
  const modules = (mods ?? []).map((m) => ({
    ...m, lessons: (lessons ?? []).filter((l) => l.module_id === m.id)
  }));

  return (
    <>
      <PageHeader title="Course builder" sub="Modules → lessons. Set status to open when it's ready for learners."
        action={<Link href="/portal/admin/trainings" className="btn-ghost">← Trainings</Link>} />
      <CourseBuilder course={course!} modules={modules as any} />
    </>
  );
}
