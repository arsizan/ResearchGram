"use client";

import type { Dispatch, SetStateAction } from "react";
import AppNav from "@/components/AppNav";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import {
  Search,
  ExternalLink,
  FileText,
  Quote,
  TrendingUp,
  Unlock,
  Lock,
  Sparkles,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import type { Paper, SearchResult } from "@/lib/scholar/types";

type DiscoverUIProps = {
  checkingAuth: boolean;
  query: string;
  searching: boolean;
  result: SearchResult | null;
  errorMessage: string;
  setQuery: Dispatch<SetStateAction<string>>;
  handleSubmit: () => void;
  handleExampleSearch: (term: string) => void;
};

const EXAMPLE_SEARCHES = [
  "federated learning for medical imaging",
  "rice leaf disease detection CNN",
  "low-cost IoT air quality monitoring",
  "Bangla natural language processing",
];

function formatAuthors(authors: Paper["authors"]) {
  if (authors.length === 0) return "Unknown authors";
  const names = authors.slice(0, 3).map((a) => a.name);
  if (authors.length > 3) names.push(`+${authors.length - 3} more`);
  return names.join(", ");
}

function compactNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function MetricChip({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Quote;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <span
      title={hint}
      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function PaperCard({ paper }: { paper: Paper }) {
  const journal = paper.journal;

  return (
    <article className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold leading-snug text-foreground">
          {paper.landingPageUrl ? (
            <a
              href={paper.landingPageUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary hover:underline"
            >
              {paper.title}
            </a>
          ) : (
            paper.title
          )}
        </h3>

        {paper.isOpenAccess ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <Unlock className="h-3 w-3" aria-hidden="true" /> Open
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" /> Paywalled
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {formatAuthors(paper.authors)}
        {paper.authors[0]?.institution ? ` · ${paper.authors[0].institution}` : ""}
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        {journal?.name || "Unknown venue"}
        {paper.year ? ` · ${paper.year}` : ""}
      </p>

      {paper.tldr && (
        <p className="mt-3 rounded-xl border-l-2 border-primary bg-muted/60 px-3 py-2 text-sm leading-6 text-foreground">
          <Sparkles
            className="mr-1.5 inline h-3.5 w-3.5 text-primary"
            aria-hidden="true"
          />
          {paper.tldr}
        </p>
      )}

      {!paper.tldr && paper.abstract && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {paper.abstract}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MetricChip
          icon={Quote}
          label="citations"
          value={compactNumber(paper.citationCount)}
          hint="Total citations recorded by OpenAlex"
        />

        {paper.influentialCitationCount !== null && (
          <MetricChip
            icon={TrendingUp}
            label="influential"
            value={compactNumber(paper.influentialCitationCount)}
            hint="Citations where the citing paper builds on this one (Semantic Scholar)"
          />
        )}

        {journal?.twoYearMeanCitedness !== null &&
          journal?.twoYearMeanCitedness !== undefined && (
            <MetricChip
              icon={BookOpen}
              label="journal impact"
              value={journal.twoYearMeanCitedness.toFixed(2)}
              hint="OpenAlex 2-year mean citedness — the open equivalent of Impact Factor. Not the licensed Clarivate JIF."
            />
          )}

        {journal?.hIndex !== null && journal?.hIndex !== undefined && (
          <MetricChip
            icon={FileText}
            label="journal h-index"
            value={compactNumber(journal.hIndex)}
            hint="h-index of the journal, from OpenAlex"
          />
        )}
      </div>

      {paper.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {paper.topics.map((topic) => (
            <span
              key={topic}
              className="rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {paper.pdfUrl && (
          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Read PDF
          </a>
        )}

        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> DOI
          </a>
        )}
      </div>
    </article>
  );
}

export default function DiscoverUI({
  checkingAuth,
  query,
  searching,
  result,
  errorMessage,
  setQuery,
  handleSubmit,
  handleExampleSearch,
}: DiscoverUIProps) {
  if (checkingAuth) {
    return <ResearchGramSkeleton activePage="search" variant="generic" />;
  }

  const degraded =
    result &&
    (!result.diagnostics.journalMetricsOk || !result.diagnostics.semanticScholarOk);

  return (
    <main className="min-h-screen bg-background">
      <AppNav activePage="search" />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Discover research</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search 250 million published works. Every result carries its citations,
            journal metrics and a free PDF link where one exists.
          </p>
        </header>

        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="discover-query" className="sr-only">
              Search the research literature
            </label>
            <input
              id="discover-query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. federated learning for medical imaging"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {errorMessage && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        {!result && !searching && !errorMessage && (
          <section className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Try one of these
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_SEARCHES.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => handleExampleSearch(term)}
                  className="rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {term}
                </button>
              ))}
            </div>
          </section>
        )}

        {searching && (
          <p className="mt-8 text-sm text-muted-foreground">
            Searching OpenAlex and Semantic Scholar…
          </p>
        )}

        {result && !searching && (
          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">
                  {result.totalFound.toLocaleString()}
                </span>{" "}
                works match. Showing the {result.papers.length} most relevant.
              </p>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {result.diagnostics.tookMs} ms
              </p>
            </div>

            {degraded && (
              <p className="mt-4 rounded-xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
                Some enrichment was unavailable for this search
                {result.diagnostics.notes.length > 0
                  ? `: ${result.diagnostics.notes.join("; ")}`
                  : "."}{" "}
                Titles, citations and links are unaffected.
              </p>
            )}

            {result.papers.length === 0 ? (
              <p className="mt-8 text-sm text-muted-foreground">
                No papers matched that search. Try broader terms, or fewer of them.
              </p>
            ) : (
              <div className="mt-5 flex flex-col gap-4">
                {result.papers.map((paper) => (
                  <PaperCard key={paper.id} paper={paper} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
