/**
 * Shared shapes for the scholarly search pipeline.
 *
 * Everything here is what OUR app uses. The raw API responses from OpenAlex and
 * Semantic Scholar are normalised into these types at the edge, so if either
 * provider changes a field name, only the adapter file changes.
 */

export type PaperAuthor = {
  name: string;
  /** OpenAlex author id, when known — lets us link to their other work later. */
  openalexId: string | null;
  orcid: string | null;
  institution: string | null;
};

export type JournalMetrics = {
  name: string;
  /** OpenAlex source id, e.g. "S137773608". Used to batch-fetch journal metrics. */
  openalexSourceId: string | null;
  /** ISSN-L, the canonical one. Used to join against the Scimago quartile table. */
  issnL: string | null;
  publisher: string | null;
  /**
   * OpenAlex `2yr_mean_citedness`. Same formula as Journal Impact Factor, computed
   * on open data. We label it "journal impact" in the UI, never "Impact Factor" —
   * JIF is a licensed Clarivate metric and this is not it.
   */
  twoYearMeanCitedness: number | null;
  hIndex: number | null;
  i10Index: number | null;
  isOpenAccess: boolean;
  isInDoaj: boolean;
};

export type Paper = {
  /** OpenAlex work id, e.g. "W2741809807". Our primary key everywhere. */
  id: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  /** One-sentence summary from Semantic Scholar, when available. */
  tldr: string | null;
  year: number | null;
  publicationDate: string | null;
  type: string | null;
  authors: PaperAuthor[];
  journal: JournalMetrics | null;
  citationCount: number;
  /** Semantic Scholar's count of citations that actually build on the work. */
  influentialCitationCount: number | null;
  isOpenAccess: boolean;
  /** A link the reader can actually open. Free PDF where one exists. */
  pdfUrl: string | null;
  landingPageUrl: string | null;
  topics: string[];
};

export type SearchResult = {
  query: string;
  totalFound: number;
  papers: Paper[];
  /** Which enrichment steps succeeded, so the UI can degrade honestly. */
  diagnostics: {
    openAlexOk: boolean;
    journalMetricsOk: boolean;
    semanticScholarOk: boolean;
    tookMs: number;
    notes: string[];
  };
};
