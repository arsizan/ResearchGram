import type { Metadata } from "next";

/*
 * Site name, address and page metadata (audit RG-34).
 *
 * NEXT_PUBLIC_SITE_URL is the public address, for example
 * https://www.researchgram.net once a domain is chosen. Until then the Vercel
 * address is used. Links in search results and link previews are built from it.
 */
export const SITE_NAME = "ResearchGram";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://research-gram.vercel.app"
).replace(/\/+$/, "");

export const SITE_DESCRIPTION =
  "Publish research notes, control who reads your full papers, find collaborators and mentors, and search 250 million published works.";

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
