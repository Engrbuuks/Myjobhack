import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { VerificationQueue } from "@/components/VerificationQueue";

export default async function Verifications() {
  const supabase = createClient();
  const [{ data: creds }, { data: elites }, { data: chapters }] = await Promise.all([
    supabase.from("credentials").select("*").in("status", ["pending", "in_review"]).order("created_at"),
    supabase.from("elite_memberships").select("*").in("status", ["pending", "in_review"]).order("created_at"),
    supabase.from("chapters").select("id, city, country").eq("active", true).order("city")
  ]);

  const items = await Promise.all([
    ...(elites ?? []).map(async (e) => {
      const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", e.talent_id).single();
      const { data: cred } = await supabase.from("credentials")
        .select("institution, title, year, document_id").eq("talent_id", e.talent_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      let docUrl: string | null = null;
      if (cred?.document_id) {
        const { data: doc } = await supabase.from("documents").select("bucket, path").eq("id", cred.document_id).single();
        if (doc) {
          const { data: s } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.path, 3600);
          docUrl = s?.signedUrl ?? null;
        }
      }
      return {
        id: e.id, type: "elite" as const, name: p?.full_name ?? "—", email: p?.email ?? "",
        line1: `${e.distinction ?? "Distinction"} · ${cred?.institution ?? "institution on file"}`,
        line2: cred?.title ? `${cred.title}${cred.year ? ` (${cred.year})` : ""}` : "",
        docUrl, created_at: e.created_at
      };
    }),
    ...(creds ?? []).map(async (c) => {
      const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", c.talent_id).single();
      let docUrl: string | null = null;
      if (c.document_id) {
        const { data: doc } = await supabase.from("documents").select("bucket, path").eq("id", c.document_id).single();
        if (doc) {
          const { data: s } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.path, 3600);
          docUrl = s?.signedUrl ?? null;
        }
      }
      return {
        id: c.id, type: "credential" as const, name: p?.full_name ?? "—", email: p?.email ?? "",
        line1: `${c.title || c.kind} · ${c.institution}`,
        line2: [c.distinction, c.year].filter(Boolean).join(" · "),
        docUrl, created_at: c.created_at
      };
    })
  ]);

  return (
    <>
      <PageHeader title="Verifications"
        sub="Elite applications and credential reviews. Verifying an Elite application flips their whole portal." />
      <VerificationQueue items={items} chapters={chapters ?? []} />
    </>
  );
}
