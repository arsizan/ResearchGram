import Link from "next/link";
import type { ReactNode } from "react";
import BrandLogo from "@/components/BrandLogo";
import { CONTACT_EMAIL, TERMS_DATE_LABEL } from "@/lib/legal";

/*
 * Shared layout for /privacy and /terms (Phase 5): a readable column, a
 * contents list that links to each section, and the date of this version.
 */

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export function ContactLine() {
  if (CONTACT_EMAIL) {
    return (
      <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline underline-offset-2 hover:no-underline">
        {CONTACT_EMAIL}
      </a>
    );
  }
  // Only outside production: a production build on Vercel needs the address (next.config.ts).
  return <span>our contact address (not set up on this copy of the site)</span>;
}

export default function LegalDocument({
  title,
  intro,
  sections,
  otherPage,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  otherPage: { href: string; label: string };
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <BrandLogo size={32} className="h-8 w-8" />
          <span className="font-extrabold text-foreground">
            Research<span className="text-primary">Gram</span>
          </span>
        </Link>

        <article className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
          <header>
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: {TERMS_DATE_LABEL}</p>
            <div className="mt-6 space-y-3 text-[15px] leading-7 text-foreground">{intro}</div>
          </header>

          <nav aria-label="Contents" className="mt-8 rounded-2xl bg-muted px-5 py-4">
            <h2 className="text-sm font-bold text-foreground">Contents</h2>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-primary underline-offset-2 hover:underline">
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-8 space-y-8">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6">
                <h2 id={`${section.id}-title`} className="text-xl font-bold text-foreground">
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-foreground">{section.body}</div>
              </section>
            ))}
          </div>
        </article>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <Link href={otherPage.href} className="font-semibold text-primary underline-offset-2 hover:underline">
            {otherPage.label}
          </Link>
          <Link href="/" className="font-semibold text-primary underline-offset-2 hover:underline">
            Back to ResearchGram
          </Link>
        </footer>
      </div>
    </main>
  );
}
