import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

export default async function CommunityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("elite_memberships")
    .select("status").eq("talent_id", user!.id).maybeSingle();
  if (me?.status !== "verified") {
    return <PageHeader title="Community" sub="The continental directory unlocks once your membership is verified." />;
  }

  const [{ data: chapters }, { data: members }] = await Promise.all([
    supabase.from("chapters").select("id, city, country").eq("active", true).order("city"),
    supabase.from("elite_memberships").select("talent_id, chapter_id, member_no").eq("status", "verified")
  ]);

  const byChapter = new Map<string, number>();
  (members ?? []).forEach((m) => {
    if (m.chapter_id) byChapter.set(m.chapter_id, (byChapter.get(m.chapter_id) ?? 0) + 1);
  });

  return (
    <>
      <PageHeader title="The continental network"
        sub={`${(members ?? []).length} verified Elite members across Africa's chapters.`} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(chapters ?? []).map((c) => (
          <div key={c.id} className="card p-6">
            <div className="font-display font-semibold text-lg">{c.city}</div>
            <div className="text-xs text-muted-2 mb-4">{c.country}</div>
            <div className="numeral !text-3xl">{byChapter.get(c.id) ?? 0}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted mt-1">Members</div>
          </div>
        ))}
      </div>
    </>
  );
}
