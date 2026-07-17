import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

export default async function ChapterPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("elite_memberships")
    .select("chapter_id, status").eq("talent_id", user!.id).maybeSingle();

  if (me?.status !== "verified") {
    return <PageHeader title="My chapter" sub="Your chapter unlocks once your membership is verified." />;
  }
  const { data: chapter } = me.chapter_id
    ? await supabase.from("chapters").select("city, country").eq("id", me.chapter_id).single()
    : { data: null as any };
  const { data: members } = me.chapter_id
    ? await supabase.from("elite_memberships")
        .select("talent_id, member_no, distinction")
        .eq("chapter_id", me.chapter_id).eq("status", "verified").order("member_no")
    : { data: [] as any[] };

  const rows = await Promise.all(
    (members ?? []).map(async (m) => {
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from("profiles").select("full_name, city").eq("id", m.talent_id).single(),
        supabase.from("talent_profiles").select("headline").eq("profile_id", m.talent_id).single()
      ]);
      return { ...m, name: p?.full_name ?? "Member", headline: t?.headline ?? m.distinction };
    })
  );

  return (
    <>
      <PageHeader title={chapter ? `${chapter.city} Chapter` : "My chapter"}
        sub={`${rows.length} verified member${rows.length === 1 ? "" : "s"} — meet locally, collaborate globally.`} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((m) => (
          <div key={m.talent_id} className="card p-5">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-ink text-white grid place-items-center font-display font-semibold">
                {m.name[0]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{m.name}</div>
                <div className="text-xs text-muted-2 truncate">{m.headline}</div>
              </div>
              <span className="text-[10px] font-bold text-muted">№ {String(m.member_no).padStart(4, "0")}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
