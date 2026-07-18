import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { currencyFromRequest, formatMoney } from "@/lib/currency";

export const runtime = "nodejs";
export const revalidate = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currency = currencyFromRequest(headers() as unknown as Headers, url.searchParams.get("cur"));

  const admin = createAdminClient();
  const { data: trainings } = await admin.from("trainings")
    .select("id, title, description, about, topic, format, delivery, starts_at, location_or_link, price_ngn, price_usd, facilitator_name, thumbnail_document_id, status")
    .eq("is_public", true).in("status", ["open", "in_progress"])
    .order("starts_at", { ascending: true }).limit(30);

  // signed thumbnails
  const docIds = (trainings ?? []).map((t) => t.thumbnail_document_id).filter(Boolean) as string[];
  const thumbs = new Map<string, string>();
  if (docIds.length) {
    const { data: docs } = await admin.from("documents").select("id, bucket, path").in("id", docIds);
    for (const d of docs ?? []) {
      const { data: su } = await admin.storage.from(d.bucket).createSignedUrl(d.path, 3600);
      if (su?.signedUrl) thumbs.set(d.id, su.signedUrl);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

  return NextResponse.json({
    currency,
    trainings: (trainings ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      summary: t.description || (t.about ? String(t.about).slice(0, 160) : ""),
      topic: t.topic,
      format: t.format || (t.delivery === "lms" ? "lms" : "virtual"),
      starts_at: t.starts_at,
      where: t.location_or_link,
      facilitator: t.facilitator_name,
      price_display: formatMoney(currency, t.price_ngn ?? 0, t.price_usd ?? 0),
      price_ngn: t.price_ngn ?? 0,
      price_usd: t.price_usd ?? 0,
      is_free: (currency === "NGN" ? (t.price_ngn ?? 0) : (t.price_usd ?? 0)) === 0,
      thumbnail: t.thumbnail_document_id ? thumbs.get(t.thumbnail_document_id) ?? null : null,
      url: `${appUrl}/trainings/${t.id}`
    }))
  }, { headers: CORS });
}
