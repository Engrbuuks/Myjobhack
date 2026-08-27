import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ExportButton } from "@/components/ExportButton";
import { LearnerTable } from "@/components/LearnerTable";

export const dynamic = "force-dynamic";

export default async function TrainerLearners({ searchParams }: { searchParams: { training?: string } }) {
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Trainings this trainer runs (admins see all)
  const { data: me } = await admin.from("profiles").select("role").eq("id", user!.id).single();
  let tq = admin.from("trainings").select("id, title, status, starts_at").order("starts_at", { ascending: false });
  if (me?.role === "trainer") tq = tq.eq("trainer_id", user!.id);
  const { data: trainings } = await tq;

  const trainingId = searchParams.training ?? (trainings?.[0]?.id ?? null);

  let learners: any[] = [];
  if (trainingId) {
    const { data: enrolls } = await admin.from("enrollments")
      .select("id, talent_id, status, attended_at, completed_at, created_at")
      .eq("training_id", trainingId).order("created_at", { ascending: false });

    learners = await Promise.all((enrolls ?? []).map(async (e) => {
      const { data: p } = await admin.from("profiles").select("full_name, email").eq("id", e.talent_id).maybeSingle();
      return {
        id: e.id, name: p?.full_name ?? "—", email: p?.email ?? "",
        status: e.status, enrolled: new Date(e.created_at).toLocaleDateString(),
        attended: e.attended_at ? "yes" : "no", completed: e.completed_at ? "yes" : "no"
      };
    }));
  }

  const current = (trainings ?? []).find((t) => t.id === trainingId);

  return (
    <>
      <PageHeader title="Learners"
        sub="Everyone enrolled on your trainings — track attendance and completion, and mark people through." />

      {(trainings ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">You have no trainings assigned yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {(trainings ?? []).map((t) => (
              <a key={t.id} href={`/portal/trainer/learners?training=${t.id}`}
                className={`px-3 h-9 inline-flex items-center rounded-pill text-xs font-semibold border transition ${
                  t.id === trainingId ? "bg-ink text-white border-ink" : "border-line hover:border-coral"}`}>
                {t.title}
              </a>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-2">
              {learners.length} learner{learners.length === 1 ? "" : "s"}{current ? ` on ${current.title}` : ""}
            </p>
            <ExportButton rows={learners} filename="learners" label="Export" />
          </div>

          <LearnerTable rows={learners as any} />
        </>
      )}
    </>
  );
}
