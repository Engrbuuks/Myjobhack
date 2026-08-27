import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Shown only to seekers who have a résumé on file but no work history yet.
 *
 * The import feature is worthless if nobody discovers it — and the people who
 * most need it are exactly those who finished their profile before it existed
 * and have no reason to revisit that page.
 */
export async function ResumeImportPrompt() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: talent } = await supabase.from("talent_profiles")
    .select("resume_document_id").eq("profile_id", user.id).maybeSingle();
  if (!talent?.resume_document_id) return null;      // nothing to import from

  const { count } = await supabase.from("work_experiences")
    .select("id", { count: "exact", head: true }).eq("talent_id", user.id);
  if ((count ?? 0) > 0) return null;                 // they've already done it

  return (
    <div className="card p-5 mb-6 border-coral/40" style={{ background: "#FFF4F2" }}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-56">
          <div className="font-display font-semibold text-lg mb-1">
            Your work history is missing — but we can read it from your CV
          </div>
          <p className="text-sm text-muted-2 leading-relaxed">
            Employers evaluate your profile before they open your CV. Right now yours has no roles
            listed. We can pull them out of the résumé you already uploaded — you review everything
            before it's saved.
          </p>
        </div>
        <Link href="/portal/seeker/experience" className="btn-coral !h-11 shrink-0">
          Import from my CV →
        </Link>
      </div>
    </div>
  );
}
