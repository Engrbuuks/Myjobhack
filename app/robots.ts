import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/join", "/roles", "/jobs/", "/login", "/signup"], disallow: ["/portal/", "/api/"] }
    ],
    sitemap: "https://app.myjobhack.co/sitemap.xml"
  };
}
