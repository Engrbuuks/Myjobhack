import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { EliteProof } from "@/components/EliteProof";
import { eliteStanding } from "@/lib/elite";

export const dynamic = "force-dynamic";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

export default async function ProofPage() {
  // The public switch must reflect reality the moment it is flipped, so this
  // page is never served from the client router cache.
  noStore();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const standing = await eliteStanding(user!.id, admin);

  if (!standing?.verified)
    return (
      <PageHeader title="Your proof"
        sub="A public page, a verification code and a credential letter, issued once your membership is verified." />
    );

  const { data: extra } = await admin.from("elite_memberships")
    .select("public_headline, public_institution").eq("talent_id", user!.id).maybeSingle();

  return (
    <>
      <PageHeader title="Your proof"
        sub="Everything here works outside MYJOBHACK, which is the point of it: a link and a letter that anyone can check without an account." />
      <EliteProof
        publicUrl={standing.slug ? `${APP()}/e/${standing.slug}` : null}
        enabled={standing.publicProfile}
        headline={extra?.public_headline ?? null}
        institution={extra?.public_institution ?? null}
        verifyCode={standing.verifyCode}
        credits={standing.referralCredits}
      />
    </>
  );
}
