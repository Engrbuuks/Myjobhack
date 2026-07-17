import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ProfileWizard } from "@/components/ProfileWizard";

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: talent }, { data: expertise }, { data: taxonomies }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone, country, city").eq("id", user!.id).single(),
      supabase.from("talent_profiles").select("*").eq("profile_id", user!.id).single(),
      supabase.from("talent_expertise").select("taxonomy_id").eq("talent_id", user!.id),
      supabase.from("taxonomies").select("id, kind, label").eq("active", true).order("sort")
    ]);

  let resumeName: string | null = null;
  if (talent?.resume_document_id) {
    const { data: doc } = await supabase
      .from("documents").select("original_name").eq("id", talent.resume_document_id).single();
    resumeName = doc?.original_name ?? null;
  }

  return (
    <>
      <PageHeader
        title="Your profile"
        sub="Four things drive your matching: your niche, your goal, your expertise, and your expectations. Complete them all and our team goes to work."
      />
      <ProfileWizard
        profile={profile!}
        talent={talent!}
        expertiseIds={(expertise ?? []).map((e) => e.taxonomy_id)}
        taxonomies={taxonomies ?? []}
        resumeName={resumeName}
      />
    </>
  );
}
