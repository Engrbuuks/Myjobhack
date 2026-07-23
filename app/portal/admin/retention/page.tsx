import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { RetentionBoard } from "@/components/RetentionBoard";
import { getRetentionStats } from "@/lib/retention";

export const dynamic = "force-dynamic";

export default async function AdminRetentionPage() {
  const admin = createAdminClient();

  const ciRes = await admin.from("placement_checkins")
    .select("*").is("completed_at", null).order("due_on", { ascending: true });
  const tableMissing = !!ciRes.error;

  const today = new Date().toISOString().slice(0, 10);
  const pending = ciRes.data ?? [];
  const due = pending.filter((c: any) => c.due_on <= today);

  // Attach who each check-in is about.
  const rows = await Promise.all(due.slice(0, 60).map(async (c: any) => {
    const { data: p } = await admin.from("placements")
      .select("id, talent_id, employer_id, job_id, is_elite, retention_status").eq("id", c.placement_id).maybeSingle();
    const { data: talent } = p ? await admin.from("profiles").select("full_name").eq("id", p.talent_id).maybeSingle() : { data: null };
    const { data: emp } = p ? await admin.from("profiles").select("full_name").eq("id", p.employer_id).maybeSingle() : { data: null };
    const { data: job } = p?.job_id ? await admin.from("jobs").select("title").eq("id", p.job_id).maybeSingle() : { data: null };
    return {
      id: c.id, day_marker: c.day_marker, due_on: c.due_on,
      talent: talent?.full_name ?? "—", employer: emp?.full_name ?? "—",
      role: job?.title ?? "—", is_elite: !!p?.is_elite,
      overdue: c.due_on < today
    };
  }));

  const stats = tableMissing
    ? null
    : await getRetentionStats().catch(() => null);

  return (
    <>
      <PageHeader title="Retention"
        sub="What happened after the hire — the data no competitor holds. Check-ins catch problems early enough to fix." />
      {tableMissing && (
        <div className="card p-4 mb-6 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink">Retention isn't set up in the database yet</div>
          <p className="text-sm text-muted-2 mt-1">
            Run migration <b>0039_state_backfill_retention.sql</b> in Supabase, then refresh.
          </p>
        </div>
      )}
      <RetentionBoard due={rows as any} pendingTotal={pending.length} stats={stats as any} />
    </>
  );
}
