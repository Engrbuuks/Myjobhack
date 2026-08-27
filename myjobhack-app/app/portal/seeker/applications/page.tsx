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
  const [{ data: apps }, { data: interviews }] = await Promise.all([
    supabase.from("applications").select("id, job_id, status, created_at")
      .eq("talent_id", user!.id).order("created_at", { ascending: false }),
    supabase.from("interviews").select("*").eq("talent_id", user!.id)
      .in("status", ["invited", "scheduled"]).order("scheduled_at", { ascending: true, nullsFirst: true })
  ]);

  const jobIds = Array.from(new Set([...(apps ?? []).map((a) => a.job_id), ...(interviews ?? []).map((i) => i.job_id)]));
  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, location").in("id", jobIds)
    : { data: [] as any[] };
  const jmap = new Map((jobs ?? []).map((j) => [j.id, j]));

  return (
    <>
      <PageHeader title="My applications" sub="Every application and where it stands." />

      {(interviews ?? []).length > 0 && (
        <div className="mb-8">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Upcoming interviews 🎯</div>
          <div className="space-y-3 max-w-2xl">
            {(interviews ?? []).map((iv) => {
              const j = jmap.get(iv.job_id);
              return (
                <div key={iv.id} className="relative overflow-hidden card p-6 bg-ink text-white border-ink">
                  <span className="pointer-events-none absolute -top-14 -right-10 w-48 h-48 rounded-full bg-coral/[.16] blur-3xl" />
                  <div className="relative flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-52">
                      <div className="font-display font-semibold text-lg">{j?.title ?? "Role"}</div>
                      <div className="text-sm text-white/55 mt-1">
                        {iv.mode.replace(/_/g, " ")} ·{" "}
                        {iv.scheduled_at
                          ? new Date(iv.scheduled_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })
                          : "pick a time that works for you"}
                        {iv.duration_min ? ` · ${iv.duration_min} min` : ""}
                      </div>
                      {iv.message && <div className="text-xs text-white/45 mt-2 max-w-md">&ldquo;{iv.message}&rdquo;</div>}
                    </div>
                    {iv.calendly_url && !iv.scheduled_at && (
                      <a href={iv.calendly_url} target="_blank" rel="noopener" className="btn-coral !h-11">Pick your time →</a>
                    )}
                    {iv.location_or_link && iv.location_or_link.startsWith("http") && (
                      <a href={iv.location_or_link} target="_blank" rel="noopener" className="btn-coral !h-11">Join interview →</a>
                    )}
                    {iv.location_or_link && !iv.location_or_link.startsWith("http") && (
                      <div className="text-sm text-white/70 max-w-44">{iv.location_or_link}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
