import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { CredentialsManager } from "@/components/CredentialsManager";

export const dynamic = "force-dynamic";

export default async function CredentialsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: creds } = await supabase
    .from("credentials")
    .select("id, kind, institution, title, year, status, created_at")
    .eq("talent_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Credentials & verification"
        sub="Add your degrees, certificates and professional memberships. Our team reviews each one — verified profiles get seen first."
      />
      <CredentialsManager initial={creds ?? []} />
    </>
  );
}
