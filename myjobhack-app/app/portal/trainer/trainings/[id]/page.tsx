import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { TrainingSettings, EnrollmentRow } from "@/components/TrainingManage";
import { TrainingBroadcast } from "@/components/TrainingBroadcast";

export default async function TrainerTrainingDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: training } = await supabase.from("trainings").select("*").eq("id", params.id).single();
  if (!training || training.trainer_id !== user!.id) redirect("/portal/trainer/trainings");

  const [{ data: courses }, { data: enrolls }] = await Promise.all([
    supabase.from("courses").select("id, title").order("created_at", { ascending: false }),
    supabase.from("enrollments").select("id, status, talent_id").eq("training_id", params.id)
  ]);
  const rows = await Promise.all(
    (enrolls ?? []).map(async (e) => {
      const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", e.talent_id).single();
      return { id: e.id, status: e.status, name: p?.full_name ?? "Learner", email: p?.email ?? "" };
    })
  );
  const completed = rows.filter((r) => r.status === "completed").length;

  return (
    <>
      <PageHeader title={training.title}
        sub={`${rows.length} enrolled · ${completed} completed`}
        action={<Link href="/portal/trainer/trainings" className="btn-ghost">← My trainings</Link>} />
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <TrainingSettings training={training} courses={courses ?? []} />
          <TrainingBroadcast trainingId={params.id} />
        </div>
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Learners & attendance</div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-2">No registrations yet.</p>
          ) : (
            <div className="space-y-2">{rows.map((r) => <EnrollmentRow key={r.id} e={r} />)}</div>
          )}
        </div>
      </div>
    </>
  );
}
