import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { ConnectButton } from "@/components/ConnectButton";

export default async function CommunityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("elite_memberships")
    .select("status").eq("talent_id", user!.id).maybeSingle();
  if (me?.status !== "verified") {
    return <DashHero kicker="The directory" title="Members only." sub="The continental directory unlocks once your membership is verified." />;
  }

  const [{ data: chapters }, { data: members }] = await Promise.all([
    supabase.from("chapters").select("id, city, country").eq("active", true).order("city"),
    supabase.from("elite_memberships").select("talent_id, chapter_id, member_no, distinction")
      .eq("status", "verified").order("member_no")
  ]);
  const ids = (members ?? []).map((m) => m.talent_id);
  const [{ data: profs }, { data: talents }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? supabase.from("talent_profiles").select("profile_id, headline").in("profile_id", ids) : Promise.resolve({ data: [] as any[] })
  ]);
  const pmap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
  const hmap = new Map((talents ?? []).map((t) => [t.profile_id, t.headline]));
  const cmap = new Map((chapters ?? []).map((c) => [c.id, c]));

  return (
    <>
      <DashHero kicker="The continental network" title={`${(members ?? []).length} verified minds.`}
        sub="Every member below earned their seat by credential. See everyone; message only by mutual consent." />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {(members ?? []).map((m) => {
          const ch = m.chapter_id ? cmap.get(m.chapter_id) : null;
          const self = m.talent_id === user!.id;
          return (
            <div key={m.talent_id}
              className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 hover:border-coral/50 transition p-6">
              <div className="pointer-events-none absolute -top-14 -right-10 w-44 h-44 rounded-full bg-coral/[.12] blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <span className="w-12 h-12 rounded-full bg-coral grid place-items-center font-display font-semibold text-xl">
                    {(pmap.get(m.talent_id) ?? "?")[0]}
                  </span>
                  <span className="text-[10px] font-bold text-white/40 tracking-wider">№ {String(m.member_no).padStart(4, "0")}</span>
                </div>
                <div className="font-display font-semibold text-lg leading-tight">{pmap.get(m.talent_id) ?? "Member"}{self && <span className="text-coral text-xs font-sans"> · you</span>}</div>
                <div className="text-xs text-white/45 mt-1 truncate">{hmap.get(m.talent_id) ?? m.distinction ?? "Elite member"}</div>
                <div className="text-[11px] text-[#FFB4AC] font-bold uppercase tracking-[.18em] mt-3 mb-4">
                  {ch ? `${ch.city} chapter` : "Continental"}
                </div>
                {!self && <ConnectButton recipientId={m.talent_id} compact />}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
