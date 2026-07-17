import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { StatCard } from "@/components/StatCard";

export default async function TrainerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: trainings } = await supabase.from("trainings")
    .select("id, title, status, starts_at").eq("trainer_id", user!.id);
  const ids = (trainings ?? []).map((t) => t.id);
  const { data: enrolls } = ids.length
    ? await supabase.from("enrollments").select("training_id, status").in("training_id", ids)
    : { data: [] as any[] };

  const learners = (enrolls ?? []).length;
  const completions = (enrolls ?? []).filter((e) => e.status === "completed").length;
  const upcoming = (trainings ?? [])
    .filter((t) => t.starts_at && new Date(t.starts_at) > new Date())
    .sort((a, b) => +new Date(a.starts_at!) - +new Date(b.starts_at!))[0];

  return (
    <>
      <DashHero kicker="Teaching studio" title="Your room is ready."
        sub="Trainings assigned to you — sessions, learners, and completions."
        right={
          <div className="text-right">
            <div className="numeral !text-6xl text-coral leading-none">{learners}</div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-white/45 mt-2">Learners</div>
          </div>
        }>
        <Link href="/portal/trainer/trainings" className="btn-coral !h-11">My trainings →</Link>
      </DashHero>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard label="My trainings" value={(trainings ?? []).length} accent hint="Assigned to you" />
        <StatCard label="Learners" value={learners} hint="Across all trainings" />
        <StatCard label="Completions" value={completions} hint="Marked or certified" />
        <StatCard label="Next session" value={upcoming ? new Date(upcoming.starts_at!).toLocaleDateString() : "—"}
          hint={upcoming?.title ?? "Nothing scheduled"} />
      </div>
    </>
  );
}
