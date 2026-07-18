import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { FunnelToggle } from "@/components/FunnelToggle";

async function count(supabase: any, table: string, filter?: (q: any) => any) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

const STEP_LABELS: Record<string, string> = {
  d1_profile: "Day 1 · Complete profile",
  d3_resume: "Day 3 · Upload resume",
  d7_toolkit: "Day 7 · Toolkit pitch",
  d14_apply: "Day 14 · First application"
};

export default async function FunnelPage() {
  const supabase = createClient();

  const { data: talentProfiles } = await supabase
    .from("profiles").select("id").in("role", ["job_seeker", "elite_member"]);
  const ids = (talentProfiles ?? []).map((p) => p.id);
  const signups = ids.length;

  const [complete, withResume, { data: applicants }, { data: subscribers }, { data: activeSubs }, { data: drips }, { data: cfg }] =
    await Promise.all([
      count(supabase, "talent_profiles", (q: any) => q.gte("profile_completion", 100).in("profile_id", ids.length ? ids : ["-"])),
      count(supabase, "talent_profiles", (q: any) => q.not("resume_document_id", "is", null).in("profile_id", ids.length ? ids : ["-"])),
      supabase.from("applications").select("talent_id"),
      supabase.from("subscriptions").select("profile_id"),
      supabase.from("subscriptions").select("profile_id").eq("status", "active").gt("current_period_end", new Date().toISOString()),
      supabase.from("funnel_emails").select("step"),
      supabase.from("app_settings").select("value").eq("key", "funnel").maybeSingle()
    ]);

  const applied = new Set((applicants ?? []).map((a) => a.talent_id)).size;
  const everSub = new Set((subscribers ?? []).map((s) => s.profile_id)).size;
  const nowSub = new Set((activeSubs ?? []).map((s) => s.profile_id)).size;

  const stages = [
    { label: "Signups", n: signups },
    { label: "Profile complete", n: complete },
    { label: "Resume uploaded", n: withResume },
    { label: "Applied to a role", n: applied },
    { label: "Ever subscribed", n: everSub },
    { label: "Active subscribers", n: nowSub }
  ];
  const max = Math.max(1, signups);

  const dripCounts = new Map<string, number>();
  (drips ?? []).forEach((d) => dripCounts.set(d.step, (dripCounts.get(d.step) ?? 0) + 1));
  const enabled = (cfg?.value as any)?.enabled !== false;

  return (
    <>
      <PageHeader title="Sales funnel"
        sub="The journey from stranger to subscriber — live conversion at every stage, with automated drips moving people forward."
        action={<FunnelToggle enabled={enabled} />} />

      <div className="card p-7 mb-6">
        <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-6">The funnel</div>
        <div className="space-y-4 max-w-2xl">
          {stages.map((s, i) => {
            const pct = Math.round((s.n / max) * 100);
            const conv = i === 0 ? null : signups ? Math.round((s.n / signups) * 100) : 0;
            return (
              <div key={s.label}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-sm">
                    <b className="font-display text-lg">{s.n}</b>
                    {conv != null && <span className="text-muted-2 text-xs ml-2">{conv}% of signups</span>}
                  </span>
                </div>
                <div className="h-3.5 rounded-pill bg-paper-2 overflow-hidden">
                  <div className={`h-full rounded-pill transition-all duration-700 ${i === 0 ? "bg-ink" : "bg-coral"}`}
                    style={{ width: `${Math.max(pct, s.n > 0 ? 4 : 0)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-6">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">Automated drips (daily, 8am)</div>
          <div className="space-y-2">
            {Object.entries(STEP_LABELS).map(([step, label]) => (
              <div key={step} className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
                <span className="text-sm font-medium">{label}</span>
                <span className="font-display font-semibold">{dripCounts.get(step) ?? 0}<span className="text-xs text-muted-2 font-sans font-normal"> sent</span></span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-2 mt-4 leading-relaxed">
            Each person receives each step at most once, and only if they still qualify (incomplete profile, no resume, no subscription, no applications). Pause everything with the toggle above.
          </p>
        </div>
        <div className="card p-6">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">Feeding the top</div>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Acquisition surfaces already wired into this funnel: the website's lead forms, every public job link (share them — they end in "Create free profile"), the WhatsApp broadcast pack, and the Campaigns desk for one-off blasts.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/portal/admin/campaigns" className="btn-ghost !h-10 text-sm">Campaigns →</a>
            <a href="/portal/admin/jobs" className="btn-ghost !h-10 text-sm">Share job links →</a>
          </div>
        </div>
      </div>
    </>
  );
}
