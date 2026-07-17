import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

export default async function AdminJobs() {
  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, location, status, employment_type, created_at, form_id")
    .order("created_at", { ascending: false });

  const counts = new Map<string, number>();
  if (jobs?.length) {
    const { data: apps } = await supabase.from("applications").select("job_id");
    (apps ?? []).forEach((a) => counts.set(a.job_id, (counts.get(a.job_id) ?? 0) + 1));
  }

  return (
    <>
      <PageHeader title="Jobs" sub="Post roles, attach custom application forms, and let eligible applicants shortlist themselves."
        action={<Link href="/portal/admin/jobs/new" className="btn-coral">＋ Post a job</Link>} />
      {(jobs ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No jobs yet — post the first one.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-widest text-muted border-b border-line">
              <th className="px-5 py-3 font-bold">Role</th><th className="px-5 py-3 font-bold">Status</th>
              <th className="px-5 py-3 font-bold">Form</th><th className="px-5 py-3 font-bold">Applicants</th><th className="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id} className="border-b border-line last:border-0 hover:bg-paper transition">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{j.title}</div>
                    <div className="text-xs text-muted-2">{j.location || "—"} · {j.employment_type.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
                      j.status === "published" ? "bg-ink text-white" :
                      j.status === "draft" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted"
                    }`}>{j.status}</span>
                  </td>
                  <td className="px-5 py-3 text-xs">{j.form_id ? "Custom ✓" : "Default"}</td>
                  <td className="px-5 py-3 font-display font-semibold text-lg">{counts.get(j.id) ?? 0}</td>
                  <td className="px-5 py-3 text-right space-x-4 whitespace-nowrap">
                    <Link href={`/portal/admin/jobs/${j.id}/applicants`} className="text-ink font-semibold">Applicants</Link>
                    <Link href={`/portal/admin/jobs/${j.id}`} className="text-coral font-semibold">Edit →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
