import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/pricing";
import { generateJobAssessment } from "@/lib/assessment";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Employer orders a JOB-SPECIFIC assessment for shortlisted candidates.
 * Employer pays per finalist (invoice raised). A real test is generated from
 * THE POSTING's requirements for each candidate.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { job_id, talent_ids } = await request.json();
  const ids: string[] = Array.isArray(talent_ids) ? talent_ids.filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one shortlisted candidate." }, { status: 400 });
  if (!job_id) return NextResponse.json({ error: "A job is required for a job-specific assessment." }, { status: 400 });

  // Load the posting to tailor the test.
  const { data: job } = await admin.from("jobs")
    .select("title, description, key_requirements, role_level").eq("id", job_id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const pricing = await getPricing();
  const perCandidate = pricing.job_assessment_per_candidate_ngn ?? 5000;
  const amount = ids.length * perCandidate;

  // Generate ONE job-specific test (same posting → same test), assign to each candidate.
  const gen = await generateJobAssessment({
    job_title: job.title,
    job_description: job.description ?? "",
    requirements: Array.isArray(job.key_requirements) ? job.key_requirements : [],
    level: (job.role_level as string) ?? "mid"
  });
  if (gen.error || !gen.questions.length)
    return NextResponse.json({ error: `Could not generate the assessment: ${gen.error ?? "no questions"}` }, { status: 502 });

  // Create an assessment row per candidate.
  const created: string[] = [];
  for (const talentId of ids) {
    const { data: asmt } = await admin.from("assessments").insert({
      talent_id: talentId, job_id, ordered_by: user.id,
      field_label: job.title, role_level: job.role_level as any,
      status: "generated", generated_by: gen.model ?? "gemini",
      questions: gen.questions, time_limit_min: gen.time_limit_min
    }).select("id").single();
    if (asmt) created.push(asmt.id);
  }

  // Raise the invoice (employer pays per finalist).
  const invNumber = `ASM-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  await admin.from("invoices").insert({
    number: invNumber, client_name: me?.full_name ?? "Employer", client_email: me?.email ?? "",
    currency: "NGN",
    items: [{ description: `Job-specific assessment — ${ids.length} candidate(s) · ${job.title}`, qty: ids.length, amount: perCandidate }],
    total: amount, status: "draft", created_by: user.id
  });

  // Record the order.
  const { data: order } = await admin.from("assessment_orders").insert({
    employer_id: user.id, job_id, talent_ids: ids, amount, currency: "NGN", status: "generated"
  }).select("id").single();

  await sendEmail("hello@myjobhack.co", `Job-specific assessment ordered — ${ids.length}`, renderEmail({
    kicker: "Assessment order",
    heading: `${ids.length} job-specific assessment(s) generated`,
    paragraphs: [`For role: ${job.title}. Invoice ${invNumber} raised — ₦${amount.toLocaleString()}.`],
    details: [["Candidates", String(ids.length)], ["Amount", `₦${amount.toLocaleString()}`], ["Invoice", invNumber]],
    cta: { label: "Open admin", url: `${APP()}/portal/admin` }
  }));

  return NextResponse.json({
    ok: true, order_id: order?.id, amount, invoice: invNumber, assessments: created.length,
    message: `Generated ${created.length} job-specific assessment(s) for "${job.title}". Invoice ${invNumber} raised — ₦${amount.toLocaleString()}. Candidates will be invited to take the test; you'll get scored results.`
  });
}
