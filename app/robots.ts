import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/*
 * /robots.txt (audit RG-34). Pages behind the login are not blocked here on
 * purpose: they carry a "noindex" tag instead, and a crawler can only see that
 * tag if it is allowed to fetch the page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
