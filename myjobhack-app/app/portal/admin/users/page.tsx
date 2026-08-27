import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { UserRow } from "@/components/UserRow";

export default async function UsersPage({ searchParams }: { searchParams: { role?: string; q?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let q = supabase.from("profiles").select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (searchParams.role) q = q.eq("role", searchParams.role);
  if (searchParams.q) q = q.or(`full_name.ilike.%${searchParams.q}%,email.ilike.%${searchParams.q}%`);
  const { data: users } = await q;

  const ROLES = ["", "job_seeker", "elite_member", "employer", "recruiter", "trainer", "partner", "admin"];

  return (
    <>
      <PageHeader title="Users"
        sub="Every account on the platform — change roles (this is how you appoint trainers and recruiters) or delete accounts entirely." />
      <form className="flex flex-wrap gap-3 mb-6">
        <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search name or email…" className="input !h-11 !w-72" />
        <select name="role" defaultValue={searchParams.role ?? ""} className="input !h-11 !w-auto">
          {ROLES.map((r) => <option key={r} value={r}>{r ? r.replace(/_/g, " ") : "All roles"}</option>)}
        </select>
        <button className="btn-coral !h-11">Filter</button>
      </form>
      <div className="space-y-3 max-w-3xl">
        {(users ?? []).map((u) => <UserRow key={u.id} u={u} isSelf={u.id === user!.id} />)}
        {(users ?? []).length === 0 && (
          <div className="card p-10 text-center text-sm text-muted">No users match.</div>
        )}
      </div>
    </>
  );
}
