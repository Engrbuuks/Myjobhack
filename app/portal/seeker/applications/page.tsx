import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

const BADGE: Record<string, string> = {
  shortlisted: "bg-ink text-white", interviewing: "bg-ink text-white",
  offered: "bg-coral text-white", hired: "bg-coral text-white",
  submitted: "bg-coral-soft text-coral", rules_failed: "bg-paper-2 text-muted",
  rejected: "bg-paper-2 text-muted", withdrawn: "bg-paper-2 text-muted"
};

export default async function MyApplications() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: apps } = await supabase
    .from("applications").select("id, job_id, status, created_at")
    .eq("talent_id", user!.id).order("created_at", { ascending: false });

  const jobIds = (apps ?? []).map((a) => a.job_id);
  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, location").in("id", jobIds)
    : { data: [] as any[] };
  const jmap = new Map((jobs ?? []).map((j) => [j.id, j]));

  return (
    <>
      <PageHeader title="My applications" sub="Every application and where it stands." />
      {(apps ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Nothing yet — browse open roles and make your first move.
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {(apps ?? []).map((a) => {
            const j = jmap.get(a.job_id);
            return (
              <div key={a.id} className="card p-5 flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{j?.title ?? "Role"}</div>
                  <div className="text-xs text-muted-2">{j?.location ?? ""} · {new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`px-3 py-1.5 rounded-pill text-xs font-bold capitalize ${BADGE[a.status] ?? "bg-paper-2"}`}>
                  {a.status.replace(/_/g, " ")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
