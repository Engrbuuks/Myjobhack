import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { denominate } from "@/lib/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

/** Columns added by later migrations. If a migration hasn't run yet we must
 *  still serve jobs rather than silently returning an empty list. */
const CORE = "id, title, location, work_mode, role_level, employment_type, salary_note, published_at, org_id";
const EXTRA = "salary_currency, closes_at, key_requirements, is_featured, featured_rank, company_name, company_logo_path, company_website, locations, is_multi_location";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const onlyFeatured = params.get("featured") === "1";
  const limitParam = Math.min(Math.max(Number(params.get("limit") ?? 0) || 0, 0), 50);
  const debug = params.get("debug") === "1";

  const admin = createAdminClient();
  const notes: string[] = [];
  const nowIso = new Date().toISOString();

  // ---- attempt 1: full schema ----
  let rows: any[] | null = null;
  let degraded = false;

  const build = (cols: string, withExtras: boolean, withExpiry = true) => {
    let q = admin.from("jobs").select(cols).eq("status", "published");
    /**
     * The expiry filter applies on BOTH paths.
     *
     * It used to be inside `if (withExtras)`, so the moment the full query
     * failed and we fell back to core columns, the filter vanished and every
     * expired job was served to the marketing site and the jobs list. An
     * expired role reaching a candidate is worse than a missing column, so
     * this filter is not part of the optional set.
     */
    if (withExpiry) q = q.or(`closes_at.is.null,closes_at.gt.${nowIso}`);
    if (withExtras && onlyFeatured) {
      q = q.eq("is_featured", true)
           .order("featured_rank", { ascending: true, nullsFirst: false })
           .order("published_at", { ascending: false });
    } else {
      q = q.order("published_at", { ascending: false });
    }
    return q.limit(limitParam || 50);
  };

  const full = await build(`${CORE}, ${EXTRA}`, true);
  if (full.error) {
    notes.push(`full query failed: ${full.error.message}`);
    // ---- attempt 2: core columns, but KEEP the expiry filter ----
    const core = await build(CORE, false, true);
    if (!core.error) {
      rows = core.data as any[];
      degraded = true;
    } else {
      notes.push(`core query failed: ${core.error.message}`);
      /**
       * ---- attempt 3: drop the expiry filter, only if closes_at is the
       * reason attempt 2 failed (the column does not exist yet).
       *
       * Serving expired roles is a real harm: candidates spend time applying
       * for something already closed. So this is a last resort, it is
       * announced in the payload rather than silent, and expired rows are
       * filtered out in JavaScript below as a second line of defence.
       */
      const missingColumn = /closes_at/i.test(core.error.message);
      if (!missingColumn) {
        return NextResponse.json(
          { jobs: [], error: "Job feed unavailable", detail: core.error.message, notes },
          { status: 500, headers: CORS }
        );
      }
      notes.push("closes_at column missing: expiry could not be filtered in the database");
      const bare = await build(CORE, false, false);
      if (bare.error) {
        notes.push(`bare query failed: ${bare.error.message}`);
        return NextResponse.json(
          { jobs: [], error: "Job feed unavailable", detail: bare.error.message, notes },
          { status: 500, headers: CORS }
        );
      }
      rows = bare.data as any[];
      degraded = true;
    }
  } else {
    rows = full.data as any[];
  }

  /**
   * Belt and braces: drop anything already closed, whatever the query did.
   * A stale row reaching this point means a candidate opens a dead listing,
   * so it is worth the two lines.
   */
  const jobs = (rows ?? []).filter((j: any) =>
    !j?.closes_at || new Date(j.closes_at).getTime() > Date.now());
  if ((rows?.length ?? 0) !== jobs.length) {
    notes.push(`${(rows?.length ?? 0) - jobs.length} expired job(s) filtered after query`);
  }

  // company lookups
  const orgIds = Array.from(new Set(jobs.map((j) => j.org_id).filter(Boolean))) as string[];
  const orgNames = new Map<string, string>();
  const orgLogos = new Map<string, string>();
  const orgSites = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs, error: orgErr } = await admin.from("organizations")
      .select("id, name, logo_path, website").in("id", orgIds);
    if (orgErr) {
      notes.push(`org lookup degraded: ${orgErr.message}`);
      const { data: basic } = await admin.from("organizations").select("id, name").in("id", orgIds);
      (basic ?? []).forEach((o) => orgNames.set(o.id, o.name));
    } else {
      (orgs ?? []).forEach((o) => {
        orgNames.set(o.id, o.name);
        if (o.logo_path) orgLogos.set(o.id, o.logo_path);
        if (o.website) orgSites.set(o.id, o.website);
      });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const logoUrl = (path: string | null | undefined) => {
    if (!path) return null;
    try { return admin.storage.from("company-logos").getPublicUrl(path).data.publicUrl; }
    catch { return null; }
  };

  const payload = {
    count: jobs.length,
    ...(degraded ? { degraded: true, notes } : {}),
    ...(debug ? { notes, degraded, checked: nowIso } : {}),
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location,
      work_mode: j.work_mode,
      role_level: j.role_level,
      employment_type: j.employment_type,
      salary_note: denominate(j.salary_note, j.salary_currency || "NGN"),
      salary_currency: j.salary_currency || "NGN",
      closes_at: j.closes_at ?? null,
      key_requirements: j.key_requirements ?? [],
      locations: j.locations ?? [],
      location_label: j.is_multi_location
        ? `${(j.locations ?? []).length} locations`
        : (j.location || ((j.locations ?? [])[0]
            ? ((j.locations[0].state ? j.locations[0].state + ", " : "") + j.locations[0].country)
            : "")),
      is_featured: !!j.is_featured,
      featured_rank: j.featured_rank ?? null,
      company: j.company_name || (j.org_id ? orgNames.get(j.org_id) ?? "MYJOBHACK" : "MYJOBHACK"),
      company_logo: logoUrl(j.company_logo_path || (j.org_id ? orgLogos.get(j.org_id) : null)),
      company_website: j.company_website || (j.org_id ? orgSites.get(j.org_id) ?? null : null),
      published_at: j.published_at,
      apply_url: `${appUrl}/jobs/${j.id}`,
      short_url: `${appUrl}/j/${j.id.replace(/-/g, "").slice(0, 8)}`
    }))
  };

  return NextResponse.json(payload, { headers: CORS });
}
