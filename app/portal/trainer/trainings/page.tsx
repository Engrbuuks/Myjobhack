import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

export default async function TrainerTrainings() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: trainings } = await supabase.from("trainings")
    .select("id, title, delivery, status, starts_at").eq("trainer_id", user!.id)
    .order("created_at", { ascending: false });
  const ids = (trainings ?? []).map((t) => t.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: enrolls } = await supabase.from("enrollments").select("training_id").in("training_id", ids);
    (enrolls ?? []).forEach((e) => counts.set(e.training_id, (counts.get(e.training_id) ?? 0) + 1));
  }

  return (
    <>
      <PageHeader title="My trainings" sub="Sessions and courses assigned to you by the MYJOBHACK team." />
      {(trainings ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Nothing assigned yet — the team assigns trainings to you from the admin desk.
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {(trainings ?? []).map((t) => (
            <Link key={t.id} href={`/portal/trainer/trainings/${t.id}`}
              className="card p-5 flex items-center gap-4 hover:border-coral transition">
              <div className="flex-1">
                <div className="font-semibold text-sm">{t.title}</div>
                <div className="text-xs text-muted-2">
                  {t.delivery === "lms" ? "LMS course" : "Live session"} ·{" "}
                  {t.starts_at ? new Date(t.starts_at).toLocaleString() : "no date"} · {t.status.replace(/_/g, " ")}
                </div>
              </div>
              <div className="font-display font-semibold text-xl">{counts.get(t.id) ?? 0}</div>
              <span className="text-coral font-semibold text-sm">Manage →</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
