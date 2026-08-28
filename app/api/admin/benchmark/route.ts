import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiGrounded } from "@/lib/gemini";
import { benchmarkPrompt, measureAgainstBenchmark, classifySources, boardsFor, type BenchmarkRow } from "@/lib/benchmark";

export const runtime = "nodejs";
// Kept inside what lower Vercel plans actually allow. Asking for more than
// the plan permits means the platform kills the function and returns its own
// HTML error page, which the client can only report as an opaque 502.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Market skill benchmarks.
 *
 * GET    ?niche_id=  → current benchmark for a niche, measured against the pool
 * POST   { niche_id, role_level } → fetch fresh from the web
 * PATCH  { id, approved } | { id, importance } → review a row
 * DELETE ?id=        → drop a row
 *
 * Fetched rows arrive UNAPPROVED. They are visible immediately so they can be
 * judged, but the distinction is kept everywhere: a model's reading of the web
 * is a starting point for a human decision, not a fact about your market.
 */

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin, userId: user.id };
}

function tableMissing(err: any): string | null {
  const msg = String(err?.message ?? "");
  if (err?.code === "42P01" || /relation .* does not exist|could not find the table/i.test(msg))
    return "The skill_benchmarks table doesn't exist yet. Run migration 0048_skill_benchmarks.sql in the Supabase SQL editor.";
  return null;
}

export async function GET(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const admin = g.admin;
  const url = new URL(request.url);

  // ?diagnose=1 — check each step separately and report which one breaks.
  // Chasing this through platform logs is slow and the logs often show only
  // "function crashed"; this returns the answer in the browser.
  if (url.searchParams.get("diagnose") === "1") {
    const steps: { step: string; ok: boolean; detail: string }[] = [];
    const add = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });

    const key = process.env.GEMINI_API_KEY;
    add("GEMINI_API_KEY present", !!key,
      key ? `set, ${key.length} characters, starts "${key.slice(0, 6)}…"` : "missing from this deployment's environment");
    add("GEMINI_MODEL", true, process.env.GEMINI_MODEL || "not set — falling back to gemini-flash-latest");
    add("Build marker", true, "benchmark route rev 2 (timeout + diagnostics)");

    if (key) {
      // 1 · Plain call, no tools. Isolates key/quota problems from grounding.
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-flash-latest"}:generateContent?key=${key}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }) });
        const j = await r.json().catch(() => null);
        add("Gemini reachable (no tools)", r.ok,
          r.ok ? "responded normally" : `HTTP ${r.status}: ${j?.error?.message ?? "no message"}`);
      } catch (e: any) {
        add("Gemini reachable (no tools)", false, `network error: ${e?.message}`);
      }

      // 2 · Same call WITH grounding. If 1 passes and this fails, the model
      //     or key doesn't support web search — which is the whole feature.
      for (const toolName of ["google_search", "google_search_retrieval"]) {
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-flash-latest"}:generateContent?key=${key}`,
            { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "What is the capital of Nigeria? One word." }] }],
                tools: [{ [toolName]: {} }]
              }) });
          const j = await r.json().catch(() => null);
          const cited = j?.candidates?.[0]?.groundingMetadata?.groundingChunks?.length ?? 0;
          add(`Grounding via ${toolName}`, r.ok,
            r.ok ? `worked, cited ${cited} source${cited === 1 ? "" : "s"}`
                 : `HTTP ${r.status}: ${j?.error?.message ?? "no message"}`);
        } catch (e: any) {
          add(`Grounding via ${toolName}`, false, `network error: ${e?.message}`);
        }
      }
    }

    // 3 · Does the table exist?
    const { error: tErr } = await admin.from("skill_benchmarks").select("id").limit(1);
    add("skill_benchmarks table", !tErr, tErr ? tErr.message : "present");

    // 4 · Is anything indexed to measure against?
    const { count, error: rErr } = await admin.from("resume_index")
      .select("id", { count: "exact", head: true }).eq("unreadable", false);
    add("resume_index readable rows", !rErr, rErr ? rErr.message : `${count ?? 0} CVs indexed`);

    const failed = steps.filter((s) => !s.ok);
    return NextResponse.json({
      verdict: failed.length ? `First failure: ${failed[0].step} — ${failed[0].detail}` : "Everything checks out.",
      steps
    });
  }

  const nicheId = url.searchParams.get("niche_id");

  let q = admin.from("skill_benchmarks").select("*").order("importance").order("skill");
  if (nicheId) q = q.eq("niche_id", nicheId);
  const { data: rows, error } = await q;
  if (error) {
    const m = tableMissing(error);
    return NextResponse.json({ error: m ?? error.message }, { status: m ? 400 : 500 });
  }

  const { data: resumes, error: rErr } = await admin
    .from("resume_index").select("content").eq("unreadable", false).limit(1500);
  if (rErr && !tableMissing(rErr))
    return NextResponse.json({ error: rErr.message }, { status: 500 });

  const benchmarks: BenchmarkRow[] = (rows ?? []).map((r: any) => ({
    id: r.id, skill: r.skill, importance: r.importance, why: r.why,
    niche_label: r.niche_label, role_level: r.role_level,
    source: r.source, sources: r.sources ?? [], approved: r.approved
  }));

  const coverage = measureAgainstBenchmark(benchmarks, (resumes ?? []) as any[]);

  return NextResponse.json({
    coverage,
    pool_indexed: (resumes ?? []).length,
    unapproved: benchmarks.filter((b) => !b.approved).length
  });
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (e: any) {
    // Anything unhandled still leaves as JSON, so the UI can say what broke
    // instead of surfacing a platform error page.
    return NextResponse.json({
      error: `The lookup failed unexpectedly: ${e?.message ?? "unknown error"}`
    }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const { admin, userId } = g as any;

  const { niche_id, role_level, region, boards } = await request.json().catch(() => ({} as any));
  if (!niche_id) return NextResponse.json({ error: "Choose a niche first." }, { status: 400 });

  const { data: niche } = await admin.from("taxonomies").select("id, label").eq("id", niche_id).maybeSingle();
  if (!niche) return NextResponse.json({ error: "That niche no longer exists." }, { status: 404 });

  const reg = (region || "Nigeria").trim();
  // Job boards are one input among several — never the sole source.
  const boardList: string[] = Array.isArray(boards) && boards.length
    ? boards.map((b: any) => String(b).trim()).filter(Boolean).slice(0, 12)
    : boardsFor(reg);
  const res = await geminiGrounded(
    benchmarkPrompt(niche.label, role_level ?? "", reg, boardList),
    { timeoutMs: 45_000 }   // headroom under maxDuration to return a real message
  );

  if (res.error || !res.data) {
    const detail = res.error ?? "";
    const friendly =
      /timed out/i.test(detail)
        ? "The web search took too long and was stopped. Try a narrower niche, or run it again — grounded searches vary a lot in speed."
      : /API key|API_KEY|not set/i.test(detail)
        ? "GEMINI_API_KEY is missing or rejected. Check it in Vercel → Settings → Environment Variables, then redeploy."
      : /quota|rate|429|exhausted/i.test(detail)
        ? "Gemini's quota is exhausted for now. It resets on Google's schedule — try later, or add skills by hand in the meantime."
      : /tool|search/i.test(detail)
        ? "This Gemini model doesn't support web grounding on your key. Set GEMINI_MODEL in Vercel to a current model such as gemini-flash-latest."
        : "The web lookup returned nothing usable. Try again, or add skills by hand.";
    return NextResponse.json({ error: `${friendly}`, detail }, { status: 502 });
  }

  const skills = Array.isArray(res.data?.skills) ? res.data.skills : [];
  if (!skills.length)
    return NextResponse.json({ error: "No skills came back from the lookup. Try a different niche or add them by hand." }, { status: 502 });

  const rows = skills.slice(0, 20).map((s: any) => ({
    niche_id, niche_label: niche.label,
    role_level: role_level || null,
    region: reg,
    skill: String(s.skill ?? "").trim().slice(0, 80),
    importance: ["core", "important", "nice"].includes(s.importance) ? s.importance : "important",
    why: String(s.why ?? "").trim().slice(0, 500),
    source: "web",
    sources: res.sources.slice(0, 8),
    approved: false,
    generated_at: new Date().toISOString(),
    created_by: userId
  })).filter((r: any) => r.skill.length >= 2);

  if (!rows.length)
    return NextResponse.json({ error: "The lookup returned rows but none had a usable skill name." }, { status: 502 });

  const { error } = await admin.from("skill_benchmarks")
    .upsert(rows, { onConflict: "niche_id,role_level,region,skill", ignoreDuplicates: false });

  if (error) {
    const m = tableMissing(error);
    // The unique index is expression-based, so a plain onConflict may not
    // resolve — fall back to replacing this niche's web rows outright.
    if (!m) {
      await admin.from("skill_benchmarks").delete()
        .eq("niche_id", niche_id).eq("source", "web").eq("approved", false);
      const { error: e2 } = await admin.from("skill_benchmarks").insert(rows);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: m }, { status: 400 });
    }
  }

  // What the search ACTUALLY used, classified from the returned URLs rather
  // than from the model's account of its own behaviour.
  const mix = classifySources(res.sources);

  return NextResponse.json({
    message: `Found ${rows.length} skills the market asks for in ${niche.label}` +
      (mix.distinct_hosts
        ? ` from ${mix.distinct_hosts} site${mix.distinct_hosts === 1 ? "" : "s"}` +
          (mix.job_boards.length ? ` (${mix.job_boards.length} job board${mix.job_boards.length === 1 ? "" : "s"})` : "")
        : "") +
      ". Review them before acting — nothing is approved yet.",
    added: rows.length,
    sources: res.sources.slice(0, 10),
    source_mix: mix,
    boards_searched: boardList,
    model: res.model
  });
}

export async function PATCH(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const { admin, userId } = g as any;
  const body = await request.json().catch(() => ({} as any));
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: any = {};
  if (typeof body.approved === "boolean") {
    patch.approved = body.approved;
    patch.approved_by = body.approved ? userId : null;
    patch.approved_at = body.approved ? new Date().toISOString() : null;
  }
  if (["core", "important", "nice"].includes(body.importance)) patch.importance = body.importance;
  if (typeof body.skill === "string" && body.skill.trim()) patch.skill = body.skill.trim().slice(0, 80);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await admin.from("skill_benchmarks").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await (g as any).admin.from("skill_benchmarks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
