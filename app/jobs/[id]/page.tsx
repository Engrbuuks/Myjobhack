import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300;

async function getJob(id: string) {
  const admin = createAdminClient();
  const { data: job } = await admin.from("jobs")
    .select("id, title, description, location, work_mode, role_level, employment_type, salary_note, status, published_at, org_id")
    .eq("id", id).maybeSingle();
  if (!job || job.status !== "published") return null;
  let company = "MYJOBHACK";
  if (job.org_id) {
    const { data: org } = await admin.from("organizations").select("name").eq("id", job.org_id).single();
    if (org?.name) company = org.name;
  }
  return { ...job, company };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getJob(params.id);
  if (!job) return { title: "Role unavailable — MYJOBHACK", robots: { index: false } };
  const desc = `${job.company} is hiring: ${job.title}${job.location ? ` in ${job.location}` : ""}. Apply on MYJOBHACK — qualified candidates are shortlisted automatically.`;
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
      <div className="min-h-screen bg-paper grid place-items-center p-6">
        <div className="text-center">
          <div className="font-display font-semibold text-3xl mb-2">This role is no longer open.</div>
          <p className="text-muted text-sm mb-6">But new roles land constantly — build your profile and let them find you.</p>
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
    hiringOrganization: { "@type": "Organization", name: job.company },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location || "Nigeria" } },
    ...(job.work_mode === "remote" ? { jobLocationType: "TELECOMMUTE" } : {})
  };

  return (
    <div className="min-h-screen bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="bg-ink text-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="https://myjobhack.co" className="font-bold text-lg">myjob<span className="text-coral">hack</span></a>
          <Link href="/login" className="text-sm font-semibold text-white/70 hover:text-coral transition">Sign in</Link>
        </div>
        <div className="relative overflow-hidden max-w-3xl mx-auto px-6 pb-12 pt-6">
          <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-coral/[.16] blur-3xl" />
          <div className="relative">
            <div className="text-[11px] font-extrabold uppercase tracking-[.24em] text-[#FFB4AC] mb-3">{job.company} is hiring</div>
            <h1 className="font-display font-semibold text-[clamp(28px,5vw,44px)] leading-tight mb-4">{job.title}</h1>
            <div className="flex flex-wrap gap-2 text-sm">
              {[job.location, job.work_mode, job.employment_type?.replace(/_/g, " "), job.role_level, job.salary_note]
                .filter(Boolean).map((m) => (
                  <span key={m as string} className="px-3 py-1.5 rounded-pill bg-white/10 capitalize">{m}</span>
                ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="card p-7 mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">About the role</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{job.description || "Full details shared during the process."}</p>
        </div>
        <div className="relative overflow-hidden card p-8 bg-ink text-white border-ink text-center">
          <div className="pointer-events-none absolute -top-16 -left-12 w-56 h-56 rounded-full bg-coral/[.14] blur-3xl" />
          <div className="relative">
            <div className="font-display font-semibold text-2xl mb-2">Ready to apply?</div>
            <p className="text-white/55 text-sm mb-6 max-w-md mx-auto">
              Create your free MYJOBHACK profile (two minutes) — your resume attaches automatically, and if you meet the requirements you're shortlisted instantly.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/signup" className="btn-coral !h-12">Create free profile & apply →</Link>
              <Link href="/login" className="inline-flex items-center px-6 h-12 rounded-pill border border-white/20 text-sm font-bold hover:border-coral transition">
                I have an account
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
