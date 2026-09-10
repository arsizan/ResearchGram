/**
 * OpenAlex adapter.
 *
 * OpenAlex indexes 250M+ scholarly works. It is free, needs no API key, and allows
 * 100,000 credits/day (a search costs 10). Adding a contact email puts us in the
 * "polite pool", which gets more consistent response times.
 *
 * Docs: https://docs.openalex.org
 */

import type { JournalMetrics, Paper, PaperAuthor } from "./types";

const BASE = "https://api.openalex.org";
const MAILTO = process.env.OPENALEX_MAILTO || "";

/** OpenAlex ids come back as full URLs; we store the short form. */
function shortId(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.split("/");
  return parts[parts.length - 1] || null;
}

function withMailto(url: URL): URL {
  if (MAILTO) url.searchParams.set("mailto", MAILTO);
  return url;
}

async function getJson(url: URL, timeoutMs = 12000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(withMailto(url).toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": MAILTO
          ? `ResearchGram/1.0 (mailto:${MAILTO})`
          : "ResearchGram/1.0",
      },
      // Papers do not change minute to minute. Let Next cache the upstream call.
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      throw new Error(`OpenAlex ${response.status} for ${url.pathname}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAlex ships abstracts as an inverted index (word -> positions) rather than
 * plaintext, for copyright reasons. Rebuilding it is allowed and expected.
 */
export function rebuildAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string | null {
  if (!invertedIndex) return null;

  const slots: string[] = [];

  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position === "number" && position >= 0) {
        slots[position] = word;
      }
    }
  }

  const text = slots.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

/**
 * Partial shapes for the OpenAlex responses we read. Only the fields this app
 * actually uses are declared — everything else on the payload is ignored, so an
 * upstream addition cannot break us and an upstream removal fails a type check
 * rather than surfacing as undefined at runtime.
 */
type OpenAlexSourceRef = {
  id?: string;
  display_name?: string;
  issn_l?: string | null;
  host_organization_name?: string | null;
  is_oa?: boolean;
  is_in_doaj?: boolean;
};

type OpenAlexLocation = {
  source?: OpenAlexSourceRef | null;
  pdf_url?: string | null;
  landing_page_url?: string | null;
};

type OpenAlexAuthorship = {
  author?: { id?: string; display_name?: string; orcid?: string | null };
  institutions?: { display_name?: string }[];
};

type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  publication_year?: number;
  publication_date?: string | null;
  type?: string | null;
  authorships?: OpenAlexAuthorship[];
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: { is_oa?: boolean };
  cited_by_count?: number;
  topics?: { display_name?: string }[];
};

type OpenAlexSource = OpenAlexSourceRef & {
  summary_stats?: {
    "2yr_mean_citedness"?: number;
    h_index?: number;
    i10_index?: number;
  };
};

type OpenAlexList<T> = { results?: T[]; meta?: { count?: number } };

function normaliseAuthors(work: OpenAlexWork): PaperAuthor[] {
  const authorships = Array.isArray(work.authorships) ? work.authorships : [];

  return authorships.slice(0, 25).map((authorship): PaperAuthor => ({
    name: authorship?.author?.display_name || "Unknown author",
    openalexId: shortId(authorship?.author?.id),
    orcid: authorship?.author?.orcid || null,
    institution: authorship?.institutions?.[0]?.display_name || null,
  }));
}

function normaliseWork(work: OpenAlexWork): Paper {
  const primary: OpenAlexLocation = work.primary_location || {};
  const source: OpenAlexSourceRef = primary.source || {};
  const bestOa: OpenAlexLocation = work.best_oa_location || {};

  return {
    id: shortId(work.id) || "",
    doi: work.doi ? String(work.doi).replace(/^https?:\/\/doi\.org\//, "") : null,
    title: work.title || work.display_name || "Untitled",
    abstract: rebuildAbstract(work.abstract_inverted_index),
    tldr: null, // filled in by the Semantic Scholar step
    year: typeof work.publication_year === "number" ? work.publication_year : null,
    publicationDate: work.publication_date || null,
    type: work.type || null,
    authors: normaliseAuthors(work),
    journal: source.display_name
      ? {
          name: source.display_name,
          openalexSourceId: shortId(source.id),
          issnL: source.issn_l || null,
          publisher: source.host_organization_name || null,
          // Filled in by fetchJournalMetrics — the works endpoint does not carry these.
          twoYearMeanCitedness: null,
          hIndex: null,
          i10Index: null,
          isOpenAccess: Boolean(source.is_oa),
          isInDoaj: Boolean(source.is_in_doaj),
        }
      : null,
    citationCount:
      typeof work.cited_by_count === "number" ? work.cited_by_count : 0,
    influentialCitationCount: null, // filled in by the Semantic Scholar step
    isOpenAccess: Boolean(work.open_access?.is_oa),
    pdfUrl: bestOa.pdf_url || null,
    landingPageUrl:
      bestOa.landing_page_url ||
      primary.landing_page_url ||
      (work.doi ? String(work.doi) : null),
    topics: Array.isArray(work.topics)
      ? work.topics
          .slice(0, 4)
          .map((topic) => topic?.display_name)
          .filter((name): name is string => Boolean(name))
      : [],
  };
}

export type OpenAlexSearchOptions = {
  perPage?: number;
  /** Inclusive lower bound on publication year. */
  fromYear?: number;
  openAccessOnly?: boolean;
};

export async function searchWorks(
  query: string,
  options: OpenAlexSearchOptions = {},
): Promise<{ papers: Paper[]; totalFound: number }> {
  const { perPage = 40, fromYear, openAccessOnly } = options;

  const url = new URL(`${BASE}/works`);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(Math.min(perPage, 200)));
  url.searchParams.set("sort", "relevance_score:desc");

  const filters: string[] = ["has_abstract:true"];
  if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
  if (openAccessOnly) filters.push("is_oa:true");
  url.searchParams.set("filter", filters.join(","));

  const raw = (await getJson(url)) as OpenAlexList<OpenAlexWork>;
  const results = Array.isArray(raw?.results) ? raw.results : [];

  return {
    papers: results.map(normaliseWork).filter((paper) => paper.id !== ""),
    totalFound: typeof raw?.meta?.count === "number" ? raw.meta.count : 0,
  };
}

/**
 * Journal-level metrics live on the /sources endpoint, not on works, so this is a
 * second round trip. We batch every distinct journal in the result set into one
 * request using OpenAlex's OR filter syntax (`a|b|c`).
 *
 * If it fails we return an empty map rather than throwing: a missing impact number
 * should never cost the user their search results.
 */
export async function fetchJournalMetrics(
  sourceIds: string[],
): Promise<Map<string, Partial<JournalMetrics>>> {
  const metrics = new Map<string, Partial<JournalMetrics>>();
  const unique = Array.from(new Set(sourceIds.filter(Boolean)));
  if (unique.length === 0) return metrics;

  // OpenAlex caps OR-filters at 50 values per request.
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const url = new URL(`${BASE}/sources`);
    url.searchParams.set("filter", `ids.openalex:${batch.join("|")}`);
    url.searchParams.set("per-page", String(batch.length));

    const raw = (await getJson(url)) as OpenAlexList<OpenAlexSource>;
    const results = Array.isArray(raw?.results) ? raw.results : [];

    for (const source of results) {
      const id = shortId(source?.id);
      if (!id) continue;

      const stats = source.summary_stats || {};
      metrics.set(id, {
        name: source.display_name || undefined,
        issnL: source.issn_l || null,
        publisher: source.host_organization_name || null,
        twoYearMeanCitedness:
          typeof stats["2yr_mean_citedness"] === "number"
            ? Number(stats["2yr_mean_citedness"].toFixed(2))
            : null,
        openalexSourceId: id,
        hIndex: typeof stats.h_index === "number" ? stats.h_index : null,
        i10Index: typeof stats.i10_index === "number" ? stats.i10_index : null,
        isOpenAccess: Boolean(source.is_oa),
        isInDoaj: Boolean(source.is_in_doaj),
      });
    }
  }

  return metrics;
}
