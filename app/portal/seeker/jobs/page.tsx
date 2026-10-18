import Link from "next/link";
import { denominate } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { earlyAccess } from "@/lib/elite";

export default async function SeekerJobs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: jobs }, { data: myApps }] = await Promise.all([
    /**
     * Read as the signed in user, so the Elite window is enforced by the
     * policy in migration 0064 rather than by this query. A verified member
     * sees roles still inside their window; everybody else does not, even if
     * they call PostgREST directly with their own token.
     *
     * elite_until is selected so the ones that ARE held can be labelled.
     * Priority nobody can see is not a perk.
     */
    supabase.from("jobs")
      .select("id, title, location, work_mode, role_level, employment_type, salary_note, salary_currency, created_at, elite_until")
      .eq("status", "published")
    .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`).order("published_at", { ascending: false }),
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
              {(() => {
                const held = earlyAccess((j as any).elite_until);
                if (!held.held) return null;
                return (
                  <div className="mb-3 inline-flex items-center gap-2 self-start rounded-pill bg-coral-soft px-3 py-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-coral">Elite first</span>
                    <span className="text-xs text-muted">{held.label}</span>
                  </div>
                );
              })()}
              <div className="font-display font-semibold text-xl mb-1">{j.title}</div>
              <div className="text-sm text-muted mb-3">
                {[j.location, j.work_mode, j.employment_type?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
              </div>
              {j.salary_note && <div className="text-sm font-semibold mb-3">{denominate(j.salary_note, j.salary_currency)}</div>}
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
