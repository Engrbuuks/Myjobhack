import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://app.myjobhack.co";
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/join`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/roles`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/trainings`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.3 }
  ];
  try {
    const admin = createAdminClient();
    /**
     * A role inside its Elite early access window is not in the sitemap.
     *
     * It would be a strange kind of early access that announced the role to
     * Google while hiding it from the board. The public job page returns 404
     * for these, so listing them would also feed the index dead URLs.
     */
    const { data: jobs } = await admin.from("jobs")
      .select("id, published_at").eq("status", "published")
      .or(`elite_until.is.null,elite_until.lte.${new Date().toISOString()}`)
      .limit(500);
    for (const j of jobs ?? []) {
      entries.push({
        url: `${base}/jobs/${j.id}`,
        lastModified: j.published_at ?? undefined,
        changeFrequency: "daily", priority: 0.9
      });
    }
    const { data: trainings } = await admin.from("trainings")
      .select("id").eq("is_public", true).in("status", ["open", "in_progress"]).limit(200);
    for (const t of trainings ?? []) {
      entries.push({ url: `${base}/trainings/${t.id}`, changeFrequency: "weekly", priority: 0.8 });
    }
  } catch {}
  return entries;
}
