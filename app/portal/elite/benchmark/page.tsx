import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashHero } from "@/components/DashHero";
import { eliteStanding } from "@/lib/elite";
import { salaryBenchmark, naira, type Band } from "@/lib/salaryBenchmark";

export const dynamic = "force-dynamic";

/**
 * What the market actually paid, members only.
 *
 * Every figure comes from a placement this platform recorded. Nothing is
 * modelled and nothing is filled in, which is why some rows you might expect
 * are missing: a group too small to publish is withheld rather than
 * estimated, because a median over three people is a way of reading one
 * person's salary.
 */
function Table({ title, rows, minGroup }: { title: string; rows: Band[]; minGroup: number }) {
  if (!rows.length)
    return (
      <div className="card p-6">
        <h2 className="font-display font-semibold text-lg mb-1">{title}</h2>
        <p className="text-sm text-muted-2">
          No group here has reached {minGroup} placements yet, so there is nothing we can publish without
          pointing at individuals.
        </p>
      </div>
    );

  return (
    <div className="card p-6 overflow-x-auto">
      <h2 className="font-display font-semibold text-lg mb-4">{title}</h2>
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-left">
            <th className="pb-3 font-bold text-xs uppercase tracking-wider text-muted">&nbsp;</th>
            <th className="pb-3 font-bold text-xs uppercase tracking-wider text-muted text-right">Lower quarter</th>
            <th className="pb-3 font-bold text-xs uppercase tracking-wider text-muted text-right">Middle</th>
            <th className="pb-3 font-bold text-xs uppercase tracking-wider text-muted text-right">Upper quarter</th>
            <th className="pb-3 font-bold text-xs uppercase tracking-wider text-muted text-right">From</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-3 font-semibold">{r.label}</td>
              <td className="py-3 text-right text-muted">{naira(r.p25)}</td>
              <td className="py-3 text-right font-bold">{naira(r.median)}</td>
              <td className="py-3 text-right text-muted">{naira(r.p75)}</td>
              <td className="py-3 text-right text-muted-2 text-xs">{r.n} placements</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BenchmarkPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  /**
   * Gated on verified membership, checked here on the server.
   *
   * The Elite layout already keeps non members out of this folder, but a
   * layout is navigation rather than authorisation: this page reads salary
   * data with the service role, so it checks for itself.
   */
  const standing = await eliteStanding(user!.id, admin);
  if (!standing?.verified)
    return (
      <DashHero kicker="Salary benchmark" title="Members only."
        sub="What the market actually paid, from placements we recorded. It opens when your membership is verified." />
    );

  const b = await salaryBenchmark();

  const period = b.from && b.to
    ? `${new Date(b.from).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} to ${new Date(b.to).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
    : null;

  return (
    <>
      <DashHero kicker="Salary benchmark" title="What the market actually paid."
        sub="Measured from placements made through MYJOBHACK. Not a survey, not a guess, and not scraped from job adverts." />

      {b.empty ? (
        <div className="card p-10">
          <div className="font-display font-semibold text-xl mb-2">Not enough placements yet.</div>
          <p className="text-sm text-muted leading-relaxed">
            This page publishes nothing until a group reaches {b.minGroup} recorded placements. We would rather show
            you an empty page than a number we had to invent, and a median over two or three people is a way of
            reading one person&rsquo;s pay.
          </p>
        </div>
      ) : (
        <>
          <div className="card p-5 mb-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div>
              <span className="text-muted-2">Placements behind these figures </span>
              <b>{b.sampleSize}</b>
            </div>
            {period && (
              <div><span className="text-muted-2">Period </span><b>{period}</b></div>
            )}
            <div><span className="text-muted-2">Currency </span><b>Naira, monthly</b></div>
            {b.withheld > 0 && (
              <div><span className="text-muted-2">Groups withheld as too small </span><b>{b.withheld}</b></div>
            )}
          </div>

          <div className="space-y-6">
            <Table title="By field" rows={b.byField} minGroup={b.minGroup} />
            <Table title="By city" rows={b.byCity} minGroup={b.minGroup} />
            <Table title="By experience" rows={b.byExperience} minGroup={b.minGroup} />
          </div>

          <div className="card p-6 mt-6">
            <h2 className="font-display font-semibold text-lg mb-2">How to read this</h2>
            <ul className="text-sm text-muted space-y-2 leading-relaxed list-disc pl-5">
              <li>
                <b>Middle</b> is the median, not the average. One unusually large package cannot drag it, which is
                what makes it worth quoting in a conversation about your own pay.
              </li>
              <li>
                Every row says how many placements it came from. A row built on {b.minGroup} is a hint; a row built
                on forty is evidence. Treat them differently.
              </li>
              <li>
                Figures are what the employer agreed monthly at the point of placement, before allowances and
                before any later rise.
              </li>
              <li>
                Nothing here is modelled or extrapolated. Where we do not have the data, the row is missing rather
                than estimated.
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}
