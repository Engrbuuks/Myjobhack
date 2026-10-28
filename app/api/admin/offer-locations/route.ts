import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { findOrAddLocation, jobLocationLabel, locationKey, missingTable } from "@/lib/offerLocations";

export const dynamic = "force-dynamic";

/**
 * The places an offer can be issued for.
 *
 * GET ?job_id= or ?application_id=
 *   { locations: [{id, name}], suggestions: [{name, id|null}], applied: string|null }
 *
 *   suggestions are the job's own locations, so the form leads with the
 *   places this role was posted for. One that is not yet in the list has no
 *   id and is added the first time an offer picks it. applied is what the
 *   candidate typed on the application form, shown as a hint only.
 *
 * POST { name } adds a place to the list, or returns the one already there
 * under another casing.
 *
 * Same capability as issuing an offer, because this exists only to serve it.
 */
export async function GET(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  const url = new URL(request.url);

  const { data: list, error } = await admin.from("offer_locations").select("id, name").order("name");
  if (error) return NextResponse.json({ error: missingTable(error.message), locations: [], suggestions: [] }, { status: 400 });
  const locations = list ?? [];

  let jobId = url.searchParams.get("job_id");
  let applied: string | null = null;
  const applicationId = url.searchParams.get("application_id");
  if (applicationId) {
    const { data: app } = await admin.from("applications")
      .select("job_id, answers").eq("id", applicationId).maybeSingle();
    jobId = jobId || app?.job_id || null;
    const raw = (app?.answers as any)?._location;
    applied = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120) : null;
  }

  const suggestions: { name: string; id: string | null }[] = [];
  if (jobId) {
    const { data: job } = await admin.from("jobs").select("locations").eq("id", jobId).maybeSingle();
    const seen = new Set<string>();
    for (const l of (Array.isArray(job?.locations) ? job!.locations : []) as any[]) {
      const name = jobLocationLabel(l);
      const key = locationKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ name, id: locations.find((x: any) => locationKey(x.name) === key)?.id ?? null });
    }
  }

  return NextResponse.json({ locations, suggestions, applied });
}

export async function POST(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;
  const b = await request.json().catch(() => ({} as any));
  const r = await findOrAddLocation(createAdminClient(), String(b.name ?? ""), gate.userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, location: r.location, created: r.created });
}
