import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SegmentFilterBar } from "@/components/SegmentFilterBar";
import { InviteEngine } from "@/components/InviteEngine";
import { filtersFromSearchParams, querySegment } from "@/lib/segment";

export default async function InvitesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = createClient();
  const filters = filtersFromSearchParams(searchParams);
  const [{ data: taxonomies }, rows, { data: trainings }, { data: batches }] = await Promise.all([
    supabase.from("taxonomies").select("id, kind, label").eq("active", true).order("sort"),
    querySegment(supabase, filters),
    supabase.from("trainings").select("id, title, delivery, starts_at")
      .in("status", ["draft", "open"]).order("created_at", { ascending: false }).limit(20),
    supabase.from("invite_batches").select("id, matched_count, created_at, filters, training_id")
      .order("created_at", { ascending: false }).limit(6)
  ]);

  return (
    <>
      <PageHeader
        title="Invite engine"
        sub="Build the segment with the filters, attach a training, press the button. Resend does the rest."
      />
      <SegmentFilterBar taxonomies={taxonomies ?? []} />
      <div className="mb-6 text-sm text-muted">
        Segment size: <b className="font-display text-2xl text-ink">{rows.length}</b>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <InviteEngine matched={rows.length} trainings={trainings ?? []} />

        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Recent blasts</div>
          {(batches ?? []).length === 0 ? (
            <p className="text-sm text-muted-2">Every blast is logged here with its exact segment.</p>
          ) : (
            <div className="space-y-3">
              {(batches ?? []).map((b) => (
                <div key={b.id} className="border border-line rounded-xl px-4 py-3 text-sm">
                  <div className="font-semibold">{b.matched_count} invited</div>
                  <div className="text-xs text-muted-2">
                    {new Date(b.created_at).toLocaleString()} ·{" "}
                    {Object.keys(b.filters ?? {}).length > 0
                      ? `${Object.keys(b.filters).length} filter(s)` : "whole pool"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
