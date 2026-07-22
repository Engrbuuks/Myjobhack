import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { EmployerPipeline } from "@/components/EmployerPipeline";

export const dynamic = "force-dynamic";

export default async function AdminPipelinePage() {
  const admin = createAdminClient();

  const res = await admin.from("employer_prospects").select("*").order("next_action_at", { ascending: true, nullsFirst: false });
  const tableMissing = !!res.error;
  const prospects = res.data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const due = prospects.filter((p: any) =>
    p.next_action_at && p.next_action_at <= today &&
    !["won", "lost"].includes(p.stage));

  const counts: Record<string, number> = {};
  prospects.forEach((p: any) => { counts[p.stage] = (counts[p.stage] ?? 0) + 1; });

  return (
    <>
      <PageHeader title="Employer pipeline"
        sub="Every target company, where it stands, and what to do next. The system remembers so you don't have to." />
      {tableMissing && (
        <div className="card p-4 mb-6 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink">The pipeline isn't set up in the database yet</div>
          <p className="text-sm text-muted-2 mt-1">
            Run migration <b>0038_employer_pipeline.sql</b> in Supabase, then refresh.
          </p>
        </div>
      )}
      <EmployerPipeline prospects={prospects as any} due={due as any} counts={counts} />
    </>
  );
}
