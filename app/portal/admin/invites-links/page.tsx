import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { InviteLinks } from "@/components/InviteLinks";

export const dynamic = "force-dynamic";

export default async function AdminInviteLinksPage() {
  const admin = createAdminClient();
  const { data: links } = await admin.from("invite_links")
    .select("*").order("created_at", { ascending: false });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.myjobhack.co";

  return (
    <>
      <PageHeader title="Invite links"
        sub="Create unique links that send people straight into the right registration — Elite membership or employer. Track how many sign up through each." />
      <InviteLinks links={(links ?? []) as any} base={base} />
    </>
  );
}
