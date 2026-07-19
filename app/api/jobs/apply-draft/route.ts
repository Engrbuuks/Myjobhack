import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TYPE_MAP: Record<string, string> = {
  short_text: "text", long_text: "textarea", number: "number",
  yes_no: "select", select: "select"
};

/** Turn the composer's screening questions into a real application form. */
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
    const { data: form, error } = await admin.from("forms").insert({
      title: `${title || job.title} — screening`,
      description: "Drafted by the AI composer, edited by the hiring team.",
      created_by: user.id
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    formId = form.id;
    await admin.from("jobs").update({ form_id: formId }).eq("id", job_id);
  }

  const { data: existing } = await admin.from("form_fields")
    .select("position").eq("form_id", formId).order("position", { ascending: false }).limit(1);
  let position = (existing?.[0]?.position ?? 0) + 1;

  const rows = questions.map((q: any) => {
    const type = TYPE_MAP[q.type] ?? "text";
    const options = q.type === "yes_no" ? ["Yes", "No"] : (q.options ?? null);
    return {
      form_id: formId,
      label: String(q.label).slice(0, 300),
      field_type: type,
      required: q.required !== false,
      options: options && options.length ? options : null,
      position: position++
    };
  });

  const { error: insErr } = await admin.from("form_fields").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, form_id: formId, added: rows.length });
}
