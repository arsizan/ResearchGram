import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/*
 * 12 Nov 2026: SEO. The web app manifest (/manifest.webmanifest): the name,
 * colours and icon that browsers use when someone adds the site to a phone's
 * home screen. Next.js links it from every page. Files with an extension are
 * outside the sign-in check (proxy.ts), so it is public like robots.txt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} · Research collaboration platform`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
