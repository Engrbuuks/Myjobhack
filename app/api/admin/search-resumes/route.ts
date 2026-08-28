import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Search every indexed CV in the pool.
 * POST { query, mode?: "any" | "all" | "phrase", limit? }
 *
 * "Someone who speaks Spanish" is not a field on any form — it lives in the
 * free text of CVs. This searches that text directly.
 *
 * TWO SEARCH STRATEGIES, because neither alone is enough:
 *
 * 1. Full-text (tsvector). Stems words, so "speaks Spanish" also finds
 *    "Spanish speaker". Fast and the right default for ordinary words.
 *
 * 2. Trigram ILIKE. Full-text tokenisation mangles anything with punctuation
 *    or short forms — "C++" becomes "c", ".NET" becomes "net", "AutoCAD" may
 *    split. For those, a literal substring match is what people expect.
 *
 * Terms are routed to whichever is appropriate rather than making the user
 * think about it.
 */

const MAX_TERMS = 12;

/** Full-text tokenisation mangles these; match them literally instead. */
function needsLiteral(term: string): boolean {
  return /[^\w\s]/.test(term) || term.replace(/\W/g, "").length <= 2;
}

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/** A readable snippet around the first match, so results can be judged fast. */
function snippet(content: string, terms: string[], width = 150): string | null {
  const lower = content.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - Math.floor(width / 2));
      return (start > 0 ? "…" : "") +
        content.slice(start, start + width).trim() +
        (start + width < content.length ? "…" : "");
    }
  }
  return null;
}

/** Which of the searched terms this CV actually contains. */
function matchedTerms(content: string, terms: string[]): string[] {
  const lower = content.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const raw = String(body.query ?? "").trim();
  const mode: "any" | "all" | "phrase" = ["any", "all", "phrase"].includes(body.mode) ? body.mode : "all";
  const limit = Math.min(Number(body.limit) || 100, 300);

  if (!raw) return NextResponse.json({ error: "Type something to search for." }, { status: 400 });

  // "spanish, french" and "spanish french" both mean two terms.
  const terms = (mode === "phrase" ? [raw] : raw.split(/[,\n]|\s+/))
    .map((t) => t.trim()).filter(Boolean).slice(0, MAX_TERMS);
  if (!terms.length) return NextResponse.json({ error: "Type something to search for." }, { status: 400 });

  let query = admin.from("resume_index")
    .select("id, profile_id, application_id, content, content_chars, unreadable, indexed_at")
    .eq("unreadable", false);

  if (mode === "phrase") {
    query = query.ilike("content", `%${escapeLike(raw)}%`);
  } else if (needsLiteral(terms.join(" ")) || terms.some(needsLiteral)) {
    // Any awkward term forces literal matching for the whole query — mixing
    // the two strategies would silently apply different rules per term.
    const ors = terms.map((t) => `content.ilike.%${escapeLike(t)}%`);
    if (mode === "any") query = query.or(ors.join(","));
    else terms.forEach((t) => { query = query.ilike("content", `%${escapeLike(t)}%`); });
  } else {
    const tsQuery = terms.join(mode === "all" ? " & " : " | ");
    query = query.textSearch("tsv", tsQuery, { config: "english" });
  }

  const { data: hits, error } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!hits?.length) {
    const { count: total } = await admin.from("resume_index")
      .select("id", { count: "exact", head: true }).eq("unreadable", false);
    return NextResponse.json({
      results: [],
      message: (total ?? 0) === 0
        ? "No CVs are indexed yet. Build the index first, then search."
        : `No CV in the pool mentions ${mode === "all" ? "all of" : ""} that. ${total} CVs searched.`,
      searched: total ?? 0
    });
  }

  // Attach names, and the profile facts you need to judge a shortlist.
  const profileIds = hits.map((h: any) => h.profile_id).filter(Boolean);
  const appIds = hits.map((h: any) => h.application_id).filter(Boolean);

  const { data: profs } = profileIds.length
    ? await admin.from("profiles").select("id, full_name, email, city, country").in("id", profileIds)
    : { data: [] as any[] };
  const { data: talents } = profileIds.length
    ? await admin.from("talent_profiles")
        .select("profile_id, headline, years_experience, expected_role_level, competency_band, resume_document_id")
        .in("profile_id", profileIds)
    : { data: [] as any[] };
  const { data: apps } = appIds.length
    ? await admin.from("applications").select("id, guest_name, guest_email, job_id").in("id", appIds)
    : { data: [] as any[] };

  const pById = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const tById = new Map((talents ?? []).map((t: any) => [t.profile_id, t]));
  const aById = new Map((apps ?? []).map((a: any) => [a.id, a]));

  const results = hits.map((h: any) => {
    const p = h.profile_id ? pById.get(h.profile_id) : null;
    const t = h.profile_id ? tById.get(h.profile_id) : null;
    const a = h.application_id ? aById.get(h.application_id) : null;
    const matched = matchedTerms(h.content ?? "", terms);
    return {
      profile_id: h.profile_id,
      application_id: h.application_id,
      name: p?.full_name ?? a?.guest_name ?? "Unnamed",
      email: p?.email ?? a?.guest_email ?? "",
      location: [p?.city, p?.country].filter(Boolean).join(", "),
      headline: t?.headline ?? "",
      years: t?.years_experience ?? null,
      level: t?.expected_role_level ?? "",
      band: t?.competency_band ?? "",
      is_guest: !h.profile_id,
      matched_terms: matched,
      // How many of the searched terms appear — the useful ranking signal
      // when someone asks for "Spanish AND customer service".
      match_count: matched.length,
      snippet: snippet(h.content ?? "", terms),
      resume_url: h.profile_id
        ? `/api/employer/resume?talent_id=${h.profile_id}`
        : `/api/employer/resume?application_id=${h.application_id}`
    };
  }).sort((x, y) => y.match_count - x.match_count || x.name.localeCompare(y.name));

  const { count: searched } = await admin.from("resume_index")
    .select("id", { count: "exact", head: true }).eq("unreadable", false);
  const { count: unreadable } = await admin.from("resume_index")
    .select("id", { count: "exact", head: true }).eq("unreadable", true);

  return NextResponse.json({
    results,
    terms,
    message: `${results.length} match${results.length === 1 ? "" : "es"} across ${searched} indexed CVs.` +
      (unreadable ? ` ${unreadable} CV${unreadable === 1 ? "" : "s"} couldn't be read and weren't searched.` : ""),
    searched: searched ?? 0,
    unreadable: unreadable ?? 0
  });
}
