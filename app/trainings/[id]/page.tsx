import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { currencyFromRequest, formatMoney } from "@/lib/currency";
import { FormattedJD } from "@/components/FormattedJD";
import { TrainingInterest } from "@/components/TrainingInterest";

export const revalidate = 300;

const FORMAT_LABEL: Record<string, string> = { lms: "Self-paced course", virtual: "Live virtual session", physical: "In-person training" };

async function getTraining(id: string) {
  const admin = createAdminClient();
  const { data: t } = await admin.from("trainings")
    .select("id, title, description, about, topic, expectations, format, delivery, starts_at, location_or_link, price_ngn, price_usd, facilitator_name, thumbnail_document_id, is_public, status, course_id")
    .eq("id", id).maybeSingle();
  if (!t?.is_public || !["open", "in_progress"].includes(t.status)) return null;

  let thumb: string | null = null;
  if (t.thumbnail_document_id) {
    const { data: d } = await admin.from("documents").select("bucket, path").eq("id", t.thumbnail_document_id).single();
    if (d) {
      const { data: su } = await admin.storage.from(d.bucket).createSignedUrl(d.path, 3600);
      thumb = su?.signedUrl ?? null;
    }
  }
  let modules = 0, lessons = 0;
  if (t.course_id) {
    const { data: mods } = await admin.from("course_modules").select("id").eq("course_id", t.course_id);
    modules = (mods ?? []).length;
    if (modules) {
      const { count } = await admin.from("lessons")
        .select("*", { count: "exact", head: true }).in("module_id", (mods ?? []).map((m) => m.id));
      lessons = count ?? 0;
    }
  }
  return { ...t, thumb, modules, lessons };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const t = await getTraining(params.id);
  if (!t) return { title: "Training unavailable — MYJOBHACK", robots: { index: false } };
  const desc = (t.description || t.about || `${t.title} — a MYJOBHACK Academy programme.`).slice(0, 155);
  return {
    title: `${t.title} — MYJOBHACK Academy`,
    description: desc,
    openGraph: { title: t.title, description: desc, type: "website", ...(t.thumb ? { images: [t.thumb] } : {}) },
    alternates: { canonical: `https://app.myjobhack.co/trainings/${params.id}` }
  };
}

export default async function PublicTrainingPage({ params }: { params: { id: string } }) {
  const t = await getTraining(params.id);
  const cur = currencyFromRequest(headers() as unknown as Headers);

  if (!t) {
    return (
      <div className="min-h-screen bg-ink text-white grid place-items-center p-6">
        <div className="text-center">
          <div className="font-display font-semibold text-3xl mb-2">This programme isn't open right now.</div>
          <p className="text-white/50 text-sm mb-6">New cohorts open regularly — join and we'll invite you.</p>
          <Link href="/join" className="btn-coral">Create my free profile →</Link>
        </div>
      </div>
    );
  }

  const price = formatMoney(cur, t.price_ngn ?? 0, t.price_usd ?? 0);
  const when = t.starts_at ? new Date(t.starts_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }) : null;

  const jsonLd = {
    "@context": "https://schema.org", "@type": "Course",
    name: t.title, description: t.description || t.about || t.title,
    provider: { "@type": "Organization", name: "MYJOBHACK", sameAs: "https://myjobhack.co" },
    ...(t.price_ngn || t.price_usd ? {
      offers: {
        "@type": "Offer",
        price: cur === "NGN" ? t.price_ngn : t.price_usd,
        priceCurrency: cur
      }
    } : {})
  };

  return (
    <div className="min-h-screen bg-ink text-white overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="https://myjobhack.co" className="font-bold tracking-tight">myjob<span className="text-coral">hack</span></a>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/trainings" className="text-white/60 hover:text-white transition">All programmes</Link>
            <Link href="/join" className="px-4 h-9 inline-flex items-center rounded-pill bg-coral text-white">Join free</Link>
          </div>
        </div>
      </header>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[10%] w-[70vw] max-w-[480px] aspect-square rounded-full bg-coral/[.13] blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-10 sm:pt-14 pb-8">
          <div className="text-[11px] font-extrabold uppercase tracking-[.24em] text-[#FFB4AC] mb-4">
            {FORMAT_LABEL[t.format ?? ""] ?? "Programme"}{t.topic ? ` · ${t.topic}` : ""}
          </div>
          <h1 className="font-display font-semibold text-[clamp(26px,6vw,50px)] leading-[1.08] max-w-3xl mb-5 break-words">{t.title}</h1>
          <div className="flex flex-wrap gap-2">
            {[when, t.location_or_link, t.facilitator_name ? `with ${t.facilitator_name}` : null,
              t.modules ? `${t.modules} modules · ${t.lessons} lessons` : null]
              .filter(Boolean).map((m) => (
                <span key={m as string} className="px-3 py-1.5 rounded-pill border border-white/15 text-xs sm:text-[13px] text-white/75">{m}</span>
              ))}
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pb-16 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-10 items-start">
          <article className="min-w-0">
            {t.thumb && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={t.thumb} alt="" className="w-full aspect-video object-cover rounded-card border border-white/10 mb-8" />
            )}
            <div className="h-px w-16 bg-coral mb-8" />
            <FormattedJD dark text={t.about || t.description || "Full curriculum shared on registration."} />

            {t.expectations && (
              <div className="mt-10 rounded-card border border-white/10 bg-white/[.04] p-5 sm:p-6">
                <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-4">What to expect</div>
                <FormattedJD dark text={t.expectations} />
              </div>
            )}

            <div className="mt-8 rounded-card border border-white/10 bg-white/[.04] p-5 sm:p-6">
              <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-4">Every programme ends with</div>
              <div className="grid sm:grid-cols-3 gap-5 text-sm">
                {[["◈", "A verifiable certificate", "Issued with a unique serial employers can check."],
                  ["◴", "A stronger profile", "Completions show on your MYJOBHACK profile automatically."],
                  ["✦", "Priority on roles", "Trained talent surfaces first when employers filter."]].map(([i, h, d]) => (
                  <div key={h}>
                    <span className="w-9 h-9 rounded-full bg-coral/20 text-coral grid place-items-center mb-3">{i}</span>
                    <div className="font-semibold mb-1">{h}</div>
                    <div className="text-white/50 text-[13px] leading-relaxed">{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <aside className="lg:sticky lg:top-6 min-w-0">
            <TrainingInterest trainingId={t.id} price={price} />
          </aside>
        </div>
      </div>

      <footer className="border-t border-white/10 py-7 text-center text-xs text-white/35">
        MYJOBHACK — Africa's workforce, transformed. <a href="https://myjobhack.co" className="text-coral font-semibold">myjobhack.co</a>
      </footer>
    </div>
  );
}
