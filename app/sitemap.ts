import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// /sitemap.xml (audit RG-34): the pages anyone can open without an account.
// 12 Nov 2026: SEO (lastModified tells search engines when to look again)
const UPDATED = new Date("2026-11-12");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: UPDATED, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/auth/signup`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/auth/login`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
