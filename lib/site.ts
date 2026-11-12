import type { Metadata } from "next";

/*
 * Site name, address and page metadata (audit RG-34).
 *
 * 9 Nov 2026: AcademicOrbit rename.
 * The public address is https://www.academicorbit.com (www is the main address;
 * academicorbit.com and the old vercel.app address redirect to it). Set
 * NEXT_PUBLIC_SITE_URL only to use another address. Links in search results and
 * link previews are built from it.
 */
export const SITE_NAME = "AcademicOrbit";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.academicorbit.com"
).replace(/\/+$/, "");

// 12 Nov 2026: SEO. The main search phrase first ("research collaboration
// platform") and who it is for, in under 160 characters (what Google shows).
export const SITE_DESCRIPTION =
  "Free research collaboration platform for students, faculty and alumni. Publish research, find collaborators and mentors, and search 250M published works.";

/**
 * Metadata for a page behind the login: it gets a title, but search engines
 * are asked not to list it (they would only see the login redirect).
 */
export function privatePage(title: string, description?: string): Metadata {
  return {
    title,
    ...(description ? { description } : {}),
    robots: { index: false, follow: false },
  };
}
