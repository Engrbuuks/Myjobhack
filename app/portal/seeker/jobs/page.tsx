import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

export default async function SeekerJobs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: jobs }, { data: myApps }] = await Promise.all([
    supabase.from("jobs")
      .select("id, title, location, work_mode, role_level, employment_type, salary_note, created_at")
      .eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("applications").select("job_id").eq("talent_id", user!.id)
  ]);
  const applied = new Set((myApps ?? []).map((a) => a.job_id));

  return (
    <>
      <PageHeader title="Open roles" sub="Roles published by the MYJOBHACK team. Your profile resume attaches automatically when you apply." />
      {(jobs ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No open roles right now. Keep your profile complete — matching runs even when the board is quiet.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {(jobs ?? []).map((j) => (
            <div key={j.id} className="card p-6 flex flex-col">
              <div className="font-display font-semibold text-xl mb-1">{j.title}</div>
              <div className="text-sm text-muted mb-3">
                {[j.location, j.work_mode, j.employment_type?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
              </div>
              {j.salary_note && <div className="text-sm font-semibold mb-3">{j.salary_note}</div>}
              <div className="mt-auto">
                {applied.has(j.id) ? (
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">✓ Applied</span>
                ) : (
                  <Link href={`/portal/seeker/jobs/${j.id}`} className="btn-coral !h-10">View & apply →</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
