import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ProfileWizard } from "@/components/ProfileWizard";

export default async function ProfilePage({ searchParams }: { searchParams: { complete?: string } }) {
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
      {searchParams.complete === "location" && (
        <div className="mb-6 rounded-xl border border-coral/30 bg-coral-soft px-5 py-4">
          <p className="font-semibold text-ink text-sm">Please add your country and city/state to continue.</p>
          <p className="text-sm text-muted-2 mt-1">Employers filter candidates by location — it's required before you can use the rest of your dashboard.</p>
        </div>
      )}
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
