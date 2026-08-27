import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { denominate } from "@/lib/currency";
import { FormattedJD } from "@/components/FormattedJD";
import { Countdown } from "@/components/Countdown";
import { GuestApplyForm } from "@/components/GuestApplyForm";

export const dynamic = "force-dynamic";

async function getJob(id: string) {
  const admin = createAdminClient();
  const { data: job } = await admin.from("jobs")
    .select("id, title, description, location, work_mode, role_level, employment_type, salary_note, salary_currency, closes_at, key_requirements, company_name, company_logo_path, company_website, status, published_at, org_id, form_id")
    .eq("id", id).maybeSingle();
  if (!job || job.status !== "published") return null;
  if (job.closes_at && new Date(job.closes_at) < new Date()) return { ...job, _closed: true } as any;
  let company = "MYJOBHACK";
  let companyLogo: string | null = null;
  let companyWebsite: string | null = null;
  if (job.org_id) {
    const { data: org } = await admin.from("organizations").select("name, logo_path, website").eq("id", job.org_id).single();
    if (org?.name) company = org.name;
    if (org?.logo_path) companyLogo = admin.storage.from("company-logos").getPublicUrl(org.logo_path).data.publicUrl;
    if (org?.website) companyWebsite = org.website;
  }
  const { data: fields } = job.form_id
    ? await admin.from("form_fields").select("id, label, field_type, required, options").eq("form_id", job.form_id).order("sort")
    : { data: [] as any[] };
  // a job may name its own client company, overriding the organisation
  if (job.company_name) company = job.company_name;
  if (job.company_logo_path) companyLogo = admin.storage.from("company-logos").getPublicUrl(job.company_logo_path).data.publicUrl;
  if (job.company_website) companyWebsite = job.company_website;

  return { ...job, company, companyLogo, companyWebsite, fields: fields ?? [] };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getJob(params.id);
  if (!job) return { title: "Role unavailable — MYJOBHACK", robots: { index: false } };
  const desc = `${job.company} is hiring: ${job.title}${job.location ? ` in ${job.location}` : ""}. Apply in two minutes — no account required.`;
  return {
    title: `${job.title} at ${job.company} — MYJOBHACK`,
    description: desc,
    openGraph: { title: `${job.title} — ${job.company}`, description: desc, type: "website" },
    alternates: { canonical: `https://app.myjobhack.co/jobs/${params.id}` }
  };
}

export default async function PublicJobPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);

  if (!job) {
    return (
      <div className="min-h-screen bg-ink text-white grid place-items-center p-6">
        <div className="text-center">
          <div className="font-display font-semibold text-3xl mb-2">This role is no longer open.</div>
          <p className="text-white/50 text-sm mb-6">But new roles land constantly — build your profile and let them find you.</p>
          <Link href="/signup" className="btn-coral">Join MYJOBHACK free →</Link>
        </div>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org", "@type": "JobPosting",
    title: job.title, description: job.description || job.title,
    datePosted: job.published_at,
    employmentType: (job.employment_type || "").toUpperCase(),
    hiringOrganization: { "@type": "Organization", name: job.company, ...(job.companyLogo ? { logo: job.companyLogo } : {}), ...(job.companyWebsite ? { sameAs: job.companyWebsite } : {}) },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location || "Nigeria" } },
    ...(job.work_mode === "remote" ? { jobLocationType: "TELECOMMUTE" } : {})
  };

  return (
    <div className="min-h-screen bg-ink text-white overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3">
          <a href="https://myjobhack.co" className="font-bold text-lg tracking-tight">myjob<span className="text-coral">hack</span></a>
          <nav className="flex items-center gap-5 text-sm font-semibold">
            <Link href="/login" className="text-white/60 hover:text-white transition">Sign in</Link>
            <Link href="/signup" className="px-4 h-9 inline-flex items-center rounded-pill bg-coral text-white hover:opacity-90 transition">Join free</Link>
          </nav>
        </div>
      </header>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[10%] w-[70vw] max-w-[480px] aspect-square rounded-full bg-coral/[.13] blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-16 w-[50vw] max-w-72 aspect-square rounded-full bg-coral/[.07] blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-10 sm:pt-14 pb-8 sm:pb-10">
          <div className="text-[11px] font-extrabold uppercase tracking-[.26em] text-[#FFB4AC] mb-4">
            {job.company} · is hiring
          </div>
          <h1 className="font-display font-semibold text-[clamp(26px,7vw,54px)] leading-[1.08] max-w-3xl mb-5 sm:mb-6 break-words hyphens-auto">
            {job.title}
          </h1>
          <div className="flex flex-wrap gap-2 items-center">
            <Countdown to={job.closes_at} />
            {[job.location, job.work_mode, job.employment_type?.replace(/_/g, " "), job.role_level, job.salary_note]
              .filter(Boolean).map((m) => (
                <span key={m as string} className="px-3 sm:px-3.5 py-1.5 rounded-pill border border-white/15 text-xs sm:text-[13px] text-white/75 capitalize break-words">{m}</span>
              ))}
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pb-16 sm:pb-20 grid lg:grid-cols-[minmax(0,1fr)_420px] gap-8 lg:gap-10 items-start">
          {/* JD — editorial column */}
          <article className="min-w-0">
            <div className="h-px w-16 bg-coral mb-8" />
            {(job.key_requirements ?? []).length > 0 && (
              <div className="mb-9 rounded-card border border-coral/25 bg-coral/[.07] p-5 sm:p-6">
                <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-coral mb-4">
                  Key requirements — read before applying
                </div>
                <ul className="space-y-3">
                  {(job.key_requirements ?? []).map((r: string, i: number) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                      <span className="w-5 h-5 rounded-full bg-coral text-white grid place-items-center text-[11px] font-extrabold shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-white/85">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <FormattedJD dark text={job.description || "Full details are shared during the process — apply and the team takes it from there."} />

            <div className="mt-10 sm:mt-12 rounded-card border border-white/10 bg-white/[.04] p-5 sm:p-6">
              <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-3">How hiring works here</div>
              <div className="grid sm:grid-cols-3 gap-5 text-sm">
                {[["01", "Apply in two minutes", "No account needed — name, email, resume, done."],
                  ["02", "The machine is fair", "Meet the requirements and you're shortlisted instantly — no black hole."],
                  ["03", "The team reaches out", "Interviews are scheduled directly with shortlisted candidates."]].map(([n, t, d]) => (
                  <div key={n}>
                    <div className="font-display font-semibold text-coral text-lg mb-1">{n}</div>
                    <div className="font-semibold mb-1">{t}</div>
                    <div className="text-white/50 text-[13px] leading-relaxed">{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* Apply — sticky rail */}
          <aside className="lg:sticky lg:top-6 min-w-0">
            <GuestApplyForm jobId={job.id} fields={job.fields as any} />
          </aside>
        </div>
      </div>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/35">
        MYJOBHACK — Africa's workforce, transformed. <a href="https://myjobhack.co" className="text-coral font-semibold">myjobhack.co</a>
      </footer>
    </div>
  );
}
