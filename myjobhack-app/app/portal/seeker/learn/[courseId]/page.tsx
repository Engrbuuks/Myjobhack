import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CoursePlayer } from "@/components/CoursePlayer";

export default async function LearnPage({ params }: { params: { courseId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: course }, { data: mods }, { data: lessons }, { data: progress }] = await Promise.all([
    supabase.from("courses").select("id, title, status").eq("id", params.courseId).single(),
    supabase.from("course_modules").select("id, title, sort").eq("course_id", params.courseId).order("sort"),
    supabase.from("lessons").select("*").order("sort"),
    supabase.from("lesson_progress").select("lesson_id").eq("talent_id", user!.id)
  ]);
  if (!course) return <PageHeader title="Course not found" />;

  const modIds = new Set((mods ?? []).map((m) => m.id));
  const courseLessons = (lessons ?? []).filter((l) => modIds.has(l.module_id));

  // signed URLs for file lessons
  const withUrls = await Promise.all(
    courseLessons.map(async (l) => {
      let fileUrl: string | null = null;
      if (l.lesson_type === "file" && l.content?.document_id) {
        const { data: doc } = await supabase
          .from("documents").select("bucket, path").eq("id", l.content.document_id).single();
        if (doc) {
          const { data: s } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.path, 3600);
          fileUrl = s?.signedUrl ?? null;
        }
      }
      return { ...l, fileUrl };
    })
  );

  const modules = (mods ?? []).map((m) => ({
    id: m.id, title: m.title,
    lessons: withUrls.filter((l) => l.module_id === m.id)
  }));

  return (
    <>
      <PageHeader title={course.title} sub="Complete every lesson to earn your certificate — completion strengthens your matching profile." />
      <CoursePlayer courseId={course.id} courseTitle={course.title}
        modules={modules as any} doneIds={(progress ?? []).map((p) => p.lesson_id)} />
    </>
  );
}
