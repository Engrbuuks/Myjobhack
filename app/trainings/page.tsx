import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { currencyFromRequest, formatMoney } from "@/lib/currency";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Trainings & courses — MYJOBHACK Academy",
  description: "Skill programmes, live sessions, and self-paced courses that make African talent employable — with certificates that employers trust.",
  alternates: { canonical: "https://app.myjobhack.co/trainings" }
};

const FORMAT_LABEL: Record<string, string> = { lms: "Self-paced course", virtual: "Live virtual", physical: "In person" };

export default async function PublicTrainings() {
  const cur = currencyFromRequest(headers() as unknown as Headers);
  const admin = createAdminClient();
  const { data: trainings } = await admin.from("trainings")
    .select("id, title, description, topic, format, delivery, starts_at, price_ngn, price_usd, facilitator_name, thumbnail_document_id")
    .eq("is_public", true).in("status", ["open", "in_progress"])
    .order("starts_at", { ascending: true }).limit(30);

  const docIds = (trainings ?? []).map((t) => t.thumbnail_document_id).filter(Boolean) as string[];
  const thumbs = new Map<string, string>();
  if (docIds.length) {
    const { data: docs } = await admin.from("documents").select("id, bucket, path").in("id", docIds);
    for (const d of docs ?? []) {
      const { data: su } = await admin.storage.from(d.bucket).createSignedUrl(d.path, 3600);
      if (su?.signedUrl) thumbs.set(d.id, su.signedUrl);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-white overflow-x-hidden">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="https://myjobhack.co" className="font-bold tracking-tight">myjob<span className="text-coral">hack</span></a>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/roles" className="text-white/60 hover:text-white transition">Roles</Link>
            <Link href="/join" className="px-4 h-9 inline-flex items-center rounded-pill bg-coral text-white">Join free</Link>
          </div>
        </div>
      </header>

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[8%] w-[70vw] max-w-[460px] aspect-square rounded-full bg-coral/[.12] blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pt-12 pb-8">
          <div className="text-[11px] font-extrabold uppercase tracking-[.26em] text-[#FFB4AC] mb-4">The Academy</div>
          <h1 className="font-display font-semibold text-[clamp(28px,5vw,48px)] leading-tight mb-3">
            Skills that get you <span className="text-coral">hired.</span>
          </h1>
          <p className="text-white/55 max-w-xl">
            Live sessions and self-paced courses taught by practitioners — each ending in a certificate employers on MYJOBHACK can verify.
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto px-5 sm:px-6 pb-16">
          {(trainings ?? []).length === 0 ? (
            <div className="rounded-card border border-white/10 p-12 text-center">
              <div className="font-display font-semibold text-2xl mb-2">New programmes are being scheduled.</div>
              <p className="text-white/50 text-sm mb-6">Create a free profile and we'll invite you to the ones matching your niche.</p>
              <Link href="/join" className="btn-coral">Create my free profile →</Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {(trainings ?? []).map((t) => {
                const price = formatMoney(cur, t.price_ngn ?? 0, t.price_usd ?? 0);
                const thumb = t.thumbnail_document_id ? thumbs.get(t.thumbnail_document_id) : null;
                return (
                  <Link key={t.id} href={`/trainings/${t.id}`}
                    className="group rounded-card border border-white/10 hover:border-coral/60 bg-white/[.03] transition overflow-hidden flex flex-col">
                    {thumb && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumb} alt="" className="w-full aspect-video object-cover" />
                    )}
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FFB4AC]">
                          {FORMAT_LABEL[t.format ?? ""] ?? (t.delivery === "lms" ? "Self-paced course" : "Live session")}
                        </span>
                      </div>
                      <div className="font-display font-semibold text-lg leading-snug group-hover:text-coral transition mb-1">{t.title}</div>
                      {t.facilitator_name && <div className="text-xs text-white/45 mb-2">with {t.facilitator_name}</div>}
                      {t.description && <p className="text-[13px] text-white/55 leading-relaxed line-clamp-2 mb-4">{t.description}</p>}
                      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                        <span className={`font-display font-semibold text-lg ${price === "Free" ? "text-white/70" : ""}`}>{price}</span>
                        <span className="text-coral font-bold text-sm">Details →</span>
                      </div>
                      {t.starts_at && (
                        <div className="text-[11px] text-white/40 mt-2">
                          Starts {new Date(t.starts_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-white/10 py-7 text-center text-xs text-white/35">
        MYJOBHACK — Africa's workforce, transformed. <a href="https://myjobhack.co" className="text-coral font-semibold">myjobhack.co</a>
      </footer>
    </div>
  );
}
