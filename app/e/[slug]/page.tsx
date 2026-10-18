import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * A member's public proof of credential.
 *
 * THIS IS THE PAGE THAT TAKES THE BADGE OFF THE PLATFORM. Verification was
 * only ever visible inside the portal, where the only people who could see it
 * already believed us. This is the link that goes in an email signature,
 * where someone who has never heard of MYJOBHACK can check it in one click.
 *
 * FOUR DECISIONS THAT MAKE IT SAFE TO PUBLISH.
 *
 * 1 · OFF BY DEFAULT. Nothing is public until the member turns it on, and
 *     turning it off takes the page down on the next request, because the
 *     flag is read here rather than baked in at build time.
 *
 * 2 · READ WITH THE SERVICE ROLE AND A NAMED LIST OF FIELDS. There is no
 *     anon policy on elite_memberships and there must not be: the row holds
 *     the reviewer, the referrer and the application history. The fields
 *     below are the whole of what may ever be shown, and they are a list in
 *     one file rather than a policy somebody widens later by accident.
 *
 * 3 · NO CONTACT DETAILS, EVER. Not the email, not the phone, not the CV.
 *     A page that carried them would be a scraper's directory of verified
 *     high achievers, which is precisely the audience worth scraping.
 *
 * 4 · NOT INDEXED. The address is random and the member shares it
 *     deliberately. Letting search engines keep a copy of somebody's name,
 *     institution and city for ever is not what they agreed to when they
 *     flipped a switch.
 */

type PublicMember = {
  name: string;
  memberNo: number;
  distinction: string | null;
  institution: string | null;
  course: string | null;
  graduationYear: number | null;
  chapter: string | null;
  classYear: number | null;
  headline: string | null;
  verifiedAt: string | null;
};

async function load(slug: string): Promise<PublicMember | null> {
  if (!/^[a-z0-9]{6,32}$/i.test(slug)) return null;
  const admin = createAdminClient();

  const { data: m } = await admin.from("elite_memberships")
    .select("talent_id, member_no, distinction, class_year, status, public_profile, public_headline, public_institution, chapter_id, verified_at")
    .eq("public_slug", slug)
    .maybeSingle();

  if (!m || m.status !== "verified" || !m.public_profile) return null;

  const [{ data: profile }, { data: chapter }, { data: cred }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", m.talent_id).maybeSingle(),
    m.chapter_id
      ? admin.from("chapters").select("city, country").eq("id", m.chapter_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    admin.from("credentials")
      .select("institution, title, year, distinction, status")
      .eq("talent_id", m.talent_id).eq("status", "verified")
      .order("year", { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    name: profile?.full_name ?? "Member",
    memberNo: m.member_no,
    distinction: cred?.distinction ?? m.distinction ?? null,
    institution: cred?.institution ?? m.public_institution ?? null,
    course: cred?.title ?? null,
    graduationYear: cred?.year ?? null,
    chapter: chapter ? `${chapter.city}, ${chapter.country}` : null,
    classYear: m.class_year ?? null,
    headline: m.public_headline ?? null,
    verifiedAt: m.verified_at ?? null
  };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const m = await load(params.slug);
  if (!m) return { title: "Not found — MYJOBHACK", robots: { index: false, follow: false } };
  return {
    title: `${m.name} — verified MYJOBHACK Elite member`,
    description: `Credential verified by MYJOBHACK. Member № ${String(m.memberNo).padStart(4, "0")}.`,
    // Deliberate. See the note at the top of this file.
    robots: { index: false, follow: false }
  };
}

export default async function PublicMemberPage({ params }: { params: { slug: string } }) {
  const m = await load(params.slug);
  if (!m) notFound();

  const ref = `№ ${String(m.memberNo).padStart(4, "0")}`;
  const since = m.verifiedAt
    ? new Date(m.verifiedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : null;

  return (
    <main className="min-h-screen bg-paper px-5 py-14">
      <div className="max-w-xl mx-auto">

        <div className="relative">
          <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-card bg-coral/80" aria-hidden="true" />
          <div className="relative rounded-card bg-ink text-white p-8 overflow-hidden border border-white/10">
            <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-coral/20 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4 mb-10">
                <span className="font-bold">myjob<span className="text-coral">hack</span></span>
                <span className="text-[10px] font-extrabold uppercase tracking-[.24em] text-[#FFB4AC]">Elite member</span>
              </div>

              <span className="w-10 h-10 rounded-full bg-coral grid place-items-center mb-5" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4.5 12.5L10 18L20 6.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>

              <h1 className="font-display font-semibold text-3xl leading-tight">{m.name}</h1>
              {m.headline && <p className="text-sm text-mint mt-2">{m.headline}</p>}

              <div className="flex justify-between gap-4 text-xs text-mint border-t border-white/10 pt-4 mt-8">
                <span>Member <b className="text-white">{ref}</b></span>
                {m.classYear && <span>Class of <b className="text-white">{m.classYear}</b></span>}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-7 mt-8">
          <h2 className="text-xs font-extrabold uppercase tracking-[.18em] text-muted mb-5">What MYJOBHACK verified</h2>
          <dl className="space-y-4 text-sm">
            {m.distinction && (
              <div className="flex gap-4">
                <dt className="w-36 shrink-0 text-muted">Distinction</dt>
                <dd className="font-semibold">{m.distinction}</dd>
              </div>
            )}
            {m.institution && (
              <div className="flex gap-4">
                <dt className="w-36 shrink-0 text-muted">Institution</dt>
                <dd className="font-semibold">{m.institution}</dd>
              </div>
            )}
            {m.course && (
              <div className="flex gap-4">
                <dt className="w-36 shrink-0 text-muted">Course</dt>
                <dd className="font-semibold">{m.course}{m.graduationYear ? `, ${m.graduationYear}` : ""}</dd>
              </div>
            )}
            {m.chapter && (
              <div className="flex gap-4">
                <dt className="w-36 shrink-0 text-muted">Chapter</dt>
                <dd className="font-semibold">{m.chapter}</dd>
              </div>
            )}
            {since && (
              <div className="flex gap-4">
                <dt className="w-36 shrink-0 text-muted">Member since</dt>
                <dd className="font-semibold">{since}</dd>
              </div>
            )}
          </dl>

          <p className="text-xs text-muted leading-relaxed mt-6 pt-5 border-t border-line">
            Membership of MYJOBHACK Elite is granted only after a member of our team has examined the original
            credential document. It is not self declared. This page shows the current status: if a membership
            is ever withdrawn, this page stops showing it.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mt-8 text-sm">
          <Link href="/verify" className="btn-ghost">Check another credential</Link>
          <Link href="/roles" className="text-muted hover:text-ink">Open roles at MYJOBHACK &rarr;</Link>
        </div>
      </div>
    </main>
  );
}
