/*
 * Terms of Service and Privacy Policy (Phase 5).
 *
 * TERMS_VERSION is the date on /terms and /privacy. When either page changes in
 * a way people must agree to again, change the date here AND in
 * public.current_terms_version() (a new migration); everyone then sees the
 * notice once more. tests/db/phase5.test.mjs checks that the two match.
 */
export const TERMS_VERSION = "2026-10-16";

/** "16 October 2026", for the pages. */
export const TERMS_DATE_LABEL = new Date(`${TERMS_VERSION}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Who runs ResearchGram, as named on the legal pages. */
export const OPERATOR_NAME = "Md. Abdur Rahman Sizan";
export const OPERATOR_DETAILS = "a student at Pabna University of Science and Technology (PUST), Bangladesh";

/**
 * The address people write to about their data. Set NEXT_PUBLIC_CONTACT_EMAIL
 * in Vercel (and .env.local). A production deployment on Vercel stops without
 * it (next.config.ts); elsewhere the pages say a contact is being set up.
 */
export const CONTACT_EMAIL = (process.env.NEXT_PUBLIC_CONTACT_EMAIL || "").trim();

/** Minimum age for an account (Bangladesh Personal Data Protection Act 2026, s.9). */
export const MINIMUM_AGE = 18;
