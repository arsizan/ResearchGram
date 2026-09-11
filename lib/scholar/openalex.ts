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

export class OpenAlexError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAlexError";
    this.status = status;
  }
}

/**
 * OpenAlex's `search` is a relevance query, not a question box.
 *
 * Sending it a whole English sentence is wrong twice over. It returns HTTP 400
 * on some punctuation, and where it does succeed the filler words ("what are the
 * main approaches to") only dilute the relevance score against the words that
 * actually carry the topic. So a question is reduced to its content words before
 * it is sent. The original question still goes to the model, which is the part
 * that has to answer it.
 */
const SEARCH_STOPWORDS = new Set([
  "a", "about", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "been", "being", "between", "both", "but", "by", "can", "could", "did",
  "do", "does", "doing", "done", "each", "for", "from", "get", "give", "had",
  "has", "have", "her", "his", "how", "i", "if", "in", "into", "is", "it",
  "its", "just", "let", "like", "main", "many", "may", "me", "might", "more",
  "most", "much", "must", "my", "need", "of", "on", "or", "other", "our",
  "out", "over", "please", "recent", "should", "show", "so", "some", "such",
  "tell", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "to", "up", "us", "use", "used", "using", "very",
  "want", "was", "we", "were", "what", "when", "where", "which", "while",
  "who", "why", "will", "with", "work", "would", "you", "your",
]);

export function toOpenAlexQuery(raw: string): string {
  // Strip every character OpenAlex might choke on, including the question mark
  // that ends most of the questions people actually type.
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const kept = cleaned
    .split(" ")
    .filter((word) => word.length > 1 && !SEARCH_STOPWORDS.has(word))
    .slice(0, 12);

  // A query made entirely of stopwords ("how do you do") is still better sent
  // than dropped — the caller decides what an empty result means.
  return kept.length > 0 ? kept.join(" ") : cleaned;
}

/** 429 and 5xx are weather, not a verdict. 400 is a verdict. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Timeouts are deliberately short and the retry count deliberately low.
 *
 * This runs inside a Vercel function capped at 60 seconds, behind a routing call
 * and in front of an answer call. Being generous here does not make the request
 * succeed — it makes the platform kill the whole thing and hand the user a raw
 * 504 instead of our error.
 *
 * The budget the whole route has to fit inside 60s:
 *   routing        9s   (lib/ai/intent.ts)
 *   search      16.8s   (8s x 2 attempts + one 0.8s wait, here)
 *   enrichment    10s   (capped as a whole in lib/scholar/index.ts)
 *   answer        20s   (lib/ai/gemini.ts)
 *                 ----
 *                 56s   plus request overhead
 */
const MAX_ATTEMPTS = 2;

async function getJson(url: URL, timeoutMs = 8000): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
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

      if (response.ok) return await response.json();

      if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
        throw new OpenAlexError(
          `OpenAlex ${response.status} for ${url.pathname}`,
          response.status,
        );
      }

      // OpenAlex sends Retry-After when it means it. Cap it: waiting 30 seconds
      // because a header said so is the same as failing, only slower.
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 3000)
          : 800;

      console.warn(
        `OPENALEX ${response.status} for ${url.pathname} — retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    } catch (error) {
      if (error instanceof OpenAlexError) throw error;

      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;

      const aborted = error instanceof Error && error.name === "AbortError";
      console.warn(
        `OPENALEX ${aborted ? "timed out" : "network error"} for ${url.pathname} — retrying`,
      );
      await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }

  const aborted = lastError instanceof Error && lastError.name === "AbortError";
  throw new OpenAlexError(
    `OpenAlex ${aborted ? "timed out" : "unreachable"} for ${url.pathname}`,
    aborted ? 504 : 502,
  );
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

  const primary = toOpenAlexQuery(query);
  if (!primary) return { papers: [], totalFound: 0 };

  // If the full keyword set is still rejected, the first few words carry most of
  // the topic. One narrower retry, then give up — this must not become a loop.
  const attempts = [primary];
  const narrowed = primary.split(" ").slice(0, 5).join(" ");
  if (narrowed !== primary) attempts.push(narrowed);

  let lastError: unknown;

  for (const term of attempts) {
    const url = new URL(`${BASE}/works`);
    url.searchParams.set("search", term);
    url.searchParams.set("per-page", String(Math.min(perPage, 200)));
    url.searchParams.set("sort", "relevance_score:desc");

    const filters: string[] = ["has_abstract:true"];
    if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
    if (openAccessOnly) filters.push("is_oa:true");
    url.searchParams.set("filter", filters.join(","));

    try {
      const raw = (await getJson(url)) as OpenAlexList<OpenAlexWork>;
      const results = Array.isArray(raw?.results) ? raw.results : [];

      return {
        papers: results.map(normaliseWork).filter((paper) => paper.id !== ""),
        totalFound: typeof raw?.meta?.count === "number" ? raw.meta.count : 0,
      };
    } catch (error) {
      lastError = error;

      // Only a rejected query is worth retrying. A timeout or an outage will
      // fail the same way twice and the user waits twice as long for it.
      if (!(error instanceof OpenAlexError) || error.status !== 400) throw error;

      console.warn(`OPENALEX 400 for search="${term}" — retrying narrower`);
    }
  }

  throw lastError;
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
