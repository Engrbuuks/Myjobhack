import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Composer question types → the field_type enum in the database. */
const TYPE_MAP: Record<string, string> = {
  short_text: "text",
  long_text: "textarea",
  number: "number",
  yes_no: "boolean",
  select: "select",
  multiselect: "multiselect",
  date: "date",
  file: "file"
};

/** Turn the composer's screening questions into real application-form fields. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id, questions, title } = await request.json();
  if (!job_id || !Array.isArray(questions) || !questions.length)
    return NextResponse.json({ error: "Nothing to add" }, { status: 400 });

  const admin = createAdminClient();
  const { data: job } = await admin.from("jobs").select("id, form_id, title").eq("id", job_id).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  let formId = job.form_id;
  if (!formId) {
    const { data: form, error } = await admin.from("application_forms").insert({
      name: `${title || job.title} — screening`,
      created_by: user.id
    }).select("id").single();
    if (error) return NextResponse.json({ error: `Could not create form: ${error.message}` }, { status: 500 });
    formId = form.id;

    const { error: linkErr } = await admin.from("jobs").update({ form_id: formId }).eq("id", job_id);
    if (linkErr) return NextResponse.json({ error: `Could not attach form: ${linkErr.message}` }, { status: 500 });
  }

  const { data: existing } = await admin.from("form_fields")
    .select("sort").eq("form_id", formId).order("sort", { ascending: false }).limit(1);
  let sort = (existing?.[0]?.sort ?? 0) + 1;

  const rows = questions.map((q: any) => {
    const type = TYPE_MAP[q.type] ?? "text";
    const options = q.type === "yes_no"
      ? null                                   // boolean renders its own yes/no control
      : (Array.isArray(q.options) && q.options.length ? q.options : null);
    return {
      form_id: formId,
      label: String(q.label).slice(0, 300),
      field_type: type,
      required: q.required !== false,
      options,
      sort: sort++
    };
  });

  const { data: inserted, error: insErr } = await admin.from("form_fields").insert(rows).select("id");
  if (insErr) return NextResponse.json({ error: `Could not add questions: ${insErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, form_id: formId, added: inserted?.length ?? 0 });
}
