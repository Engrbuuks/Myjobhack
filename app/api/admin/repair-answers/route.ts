import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recover answers orphaned by the old form-save behaviour.
 *
 * Saving a form used to delete and re-create every field, handing each
 * question a new id. Answers are keyed by field id, so they kept pointing at
 * ids that no longer exist and stopped appearing anywhere. FormBuilder no
 * longer does this — but answers orphaned before the fix are still stranded.
 *
 * GET  → what is orphaned on this job, and what it could be remapped to.
 * POST → remap one orphaned id to a current field.
 *
 * Remapping is deliberately NOT automatic. Matching by value is a guess: two
 * questions can share options ("Yes/No" appears on half the form), and a wrong
 * remap writes answers onto the wrong question with no way to tell afterwards.
 * You confirm each one.
 */

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin };
}

export async function GET(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const admin = g.admin;
  const jobId = new URL(request.url).searchParams.get("job_id");
  if (!jobId) return NextResponse.json({ error: "job_id is required" }, { status: 400 });

  const { data: job } = await admin.from("jobs").select("form_id").eq("id", jobId).maybeSingle();
  const { data: fields } = job?.form_id
    ? await admin.from("form_fields").select("id, label, field_type, options").eq("form_id", job.form_id).order("sort")
    : { data: [] as any[] };
  const liveIds = new Set((fields ?? []).map((f: any) => f.id));

  const { data: apps } = await admin.from("applications")
    .select("id, answers, created_at").eq("job_id", jobId);

  // Group orphaned answers by the dead field id they point at.
  const groups = new Map<string, { values: Map<string, number>; count: number; last: string }>();
  for (const a of (apps ?? []) as any[]) {
    for (const [fieldId, value] of Object.entries(a.answers ?? {})) {
      if (liveIds.has(fieldId)) continue;
      if (value == null || value === "") continue;
      const g = groups.get(fieldId) ?? { values: new Map(), count: 0, last: a.created_at };
      const label = Array.isArray(value) ? value.join(", ") : String(value);
      g.values.set(label, (g.values.get(label) ?? 0) + 1);
      g.count++;
      if (a.created_at > g.last) g.last = a.created_at;
      groups.set(fieldId, g);
    }
  }

  const orphans = Array.from(groups.entries()).map(([fieldId, g]) => {
    const values = Array.from(g.values.entries())
      .sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));

    // Suggest a current field whose declared options cover these values —
    // a strong hint that this is the same question after a re-create.
    const suggestions = (fields ?? []).filter((f: any) => {
      const opts = (f.options ?? []).map((o: string) => String(o).toLowerCase());
      if (!opts.length) return false;
      return values.every((v) => opts.includes(v.value.toLowerCase()));
    }).map((f: any) => ({ id: f.id, label: f.label }));

    return {
      orphaned_field_id: fieldId,
      applicants: g.count,
      last_seen: g.last,
      values: values.slice(0, 10),
      suggestions
    };
  }).sort((a, b) => b.applicants - a.applicants);

  return NextResponse.json({
    orphans,
    live_fields: (fields ?? []).map((f: any) => ({ id: f.id, label: f.label, type: f.field_type })),
    total_applications: (apps ?? []).length,
    message: orphans.length
      ? `${orphans.length} question${orphans.length === 1 ? "" : "s"} worth of answers are stranded — ${orphans.reduce((n, o) => n + o.applicants, 0)} answers in total.`
      : "No orphaned answers on this job."
  });
}

export async function POST(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const admin = g.admin;

  const { job_id, from_field_id, to_field_id } = await request.json().catch(() => ({} as any));
  if (!job_id || !from_field_id || !to_field_id)
    return NextResponse.json({ error: "job_id, from_field_id and to_field_id are required" }, { status: 400 });

  const { data: job } = await admin.from("jobs").select("form_id").eq("id", job_id).maybeSingle();
  const { data: target } = await admin.from("form_fields")
    .select("id, label").eq("id", to_field_id).eq("form_id", job?.form_id ?? "").maybeSingle();
  if (!target)
    return NextResponse.json({ error: "That target question isn't on this job's form." }, { status: 400 });

  const { data: apps } = await admin.from("applications")
    .select("id, answers").eq("job_id", job_id);

  let moved = 0, skipped = 0;
  for (const a of (apps ?? []) as any[]) {
    const answers = { ...(a.answers ?? {}) };
    const orphanValue = answers[from_field_id];
    if (orphanValue == null || orphanValue === "") continue;

    // Never overwrite an answer the applicant gave against the live question.
    if (answers[to_field_id] != null && answers[to_field_id] !== "") { skipped++; continue; }

    answers[to_field_id] = orphanValue;
    delete answers[from_field_id];
    const { error } = await admin.from("applications").update({ answers }).eq("id", a.id);
    if (!error) moved++;
  }

  return NextResponse.json({
    ok: true, moved, skipped,
    message: `Restored ${moved} answer${moved === 1 ? "" : "s"} onto "${target.label}".` +
      (skipped ? ` ${skipped} skipped — those applicants had already answered the live question, and their own answer was kept.` : "")
  });
}
