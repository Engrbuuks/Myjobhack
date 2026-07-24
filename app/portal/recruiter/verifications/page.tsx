import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { VerificationQueue } from "@/components/VerificationQueue";

export const dynamic = "force-dynamic";

/**
 * Recruiters review CREDENTIALS. Elite membership confirmation stays with
 * admins — that's a standing decision about who the platform vouches for.
 */
export default async function RecruiterVerifications() {
  const supabase = createClient();
  const { data: creds } = await supabase.from("credentials")
    .select("*").in("status", ["pending", "in_review"]).order("created_at");

  const items = await Promise.all((creds ?? []).map(async (c) => {
    const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", c.talent_id).single();
    let docUrl: string | null = null;
    if (c.document_id) {
      {
        const { signedUrlForDocument } = await import("@/lib/storage");
        docUrl = await signedUrlForDocument(supabase, c.document_id, 3600);
      }
    }
    return {
      id: c.id, type: "credential" as const, name: p?.full_name ?? "—", email: p?.email ?? "",
      line1: `${c.title || c.kind}${c.institution ? ` · ${c.institution}` : ""}`,
      line2: c.year ? String(c.year) : "",
      docUrl, created_at: c.created_at
    };
  }));

  return (
    <>
      <PageHeader title="Verifications"
        sub={`${items.length} credential${items.length === 1 ? "" : "s"} awaiting review. Confirm what's real so employers can trust the pool.`} />
      {items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">Nothing waiting — the queue is clear.</div>
      ) : (
        <VerificationQueue items={items as any} chapters={[]} />
      )}
    </>
  );
}
