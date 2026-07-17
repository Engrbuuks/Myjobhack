import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { TrainingSettings, EnrollmentRow } from "@/components/TrainingManage";

export default async function TrainingDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: training }, { data: courses }, { data: enrolls }, { count: invites }] = await Promise.all([
    supabase.from("trainings").select("*").eq("id", params.id).single(),
    supabase.from("courses").select("id, title").order("created_at", { ascending: false }),
    supabase.from("enrollments").select("id, status, talent_id").eq("training_id", params.id),
    supabase.from("training_invites").select("*", { count: "exact", head: true }).eq("training_id", params.id)
  ]);

  const rows = await Promise.all(
    (enrolls ?? []).map(async (e) => {
      const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", e.talent_id).single();
      return { id: e.id, status: e.status, name: p?.full_name ?? "—", email: p?.email ?? "" };
    })
  );
  const completed = rows.filter((r) => r.status === "completed").length;

  return (
    <>
      <PageHeader title={training?.title ?? "Training"}
        sub={`${invites ?? 0} invited · ${rows.length} enrolled · ${completed} completed`}
        action={<Link href="/portal/admin/trainings" className="btn-ghost">← All trainings</Link>} />
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <TrainingSettings training={training!} courses={courses ?? []} />
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Enrollments & attendance</div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-2">No one has registered yet. Invites convert here when accepted.</p>
          ) : (
            <div className="space-y-2">{rows.map((r) => <EnrollmentRow key={r.id} e={r} />)}</div>
          )}
        </div>
      </div>
    </>
  );
}
