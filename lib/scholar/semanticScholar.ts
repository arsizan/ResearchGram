/**
 * Semantic Scholar adapter — enrichment only.
 *
 * Two things OpenAlex does not have:
 *   - `tldr`: a one-sentence summary of the paper, already written. This is the
 *     "short overview" requirement, at zero token cost.
 *   - `influentialCitationCount`: citations where the citing paper actually builds
 *     on this one, rather than mentioning it in passing. A better signal than raw
 *     citation count for ranking.
 *
 * This step is strictly optional. Every failure path returns the papers unchanged,
 * because a missing summary must never cost the user their search results.
 *
 * Docs: https://api.semanticscholar.org/api-docs/graph
 */

import type { Paper } from "./types";

const BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch";
const FIELDS = "externalIds,tldr,influentialCitationCount,openAccessPdf";

/** Without a key you share one rate limit with every other anonymous caller. */
const API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY || "";

/** Only the fields we request in FIELDS. Every one is optional: the batch endpoint
 *  returns null for ids it cannot match, and omits fields it has no data for. */
type S2Paper = {
  externalIds?: { DOI?: string | null } | null;
  tldr?: { text?: string | null } | null;
  influentialCitationCount?: number | null;
  openAccessPdf?: { url?: string | null } | null;
};

/**
 * Semantic Scholar allows one request per second. On a 429 we wait and try again,
 * doubling the delay each time, instead of hammering them or silently dropping the
 * summaries for that search. Their Retry-After header wins when they send one.
 */
async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let delayMs = 1000;

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt >= attempts) return response;

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delayMs;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    delayMs *= 2;
  }
}

export async function enrichWithSemanticScholar(
  papers: Paper[],
): Promise<{ papers: Paper[]; ok: boolean; note?: string }> {
  // The batch endpoint keys off identifiers; DOI is the one we reliably have.
  const withDoi = papers.filter((paper) => paper.doi);
  if (withDoi.length === 0) {
    return { papers, ok: true, note: "no DOIs to enrich" };
  }

  const ids = withDoi.slice(0, 100).map((paper) => `DOI:${paper.doi}`);

  const controller = new AbortController();
  // Long enough to outlast the backoff waits below (1s + 2s) plus three requests.
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_KEY) headers["x-api-key"] = API_KEY;

      const response = await fetchWithBackoff(`${BATCH_URL}?fields=${FIELDS}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids }),
      signal: controller.signal,
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      return {
        papers,
        ok: false,
        note: `Semantic Scholar returned ${response.status}${
          response.status === 429 ? " (rate limited — request a free API key)" : ""
        }`,
      };
    }

    // The response is positional: one slot per requested id, null where unmatched.
    const results = (await response.json()) as (S2Paper | null)[];
    if (!Array.isArray(results)) {
      return { papers, ok: false, note: "unexpected Semantic Scholar response" };
    }

    const byDoi = new Map<string, S2Paper>();
    results.forEach((result, index) => {
      if (!result) return;
      const doi = withDoi[index]?.doi;
      if (doi) byDoi.set(doi.toLowerCase(), result);
    });

    const enriched = papers.map((paper) => {
      const match = paper.doi ? byDoi.get(paper.doi.toLowerCase()) : undefined;
      if (!match) return paper;

      return {
        ...paper,
        tldr: match.tldr?.text || paper.tldr,
        influentialCitationCount:
          typeof match.influentialCitationCount === "number"
            ? match.influentialCitationCount
            : paper.influentialCitationCount,
        pdfUrl: paper.pdfUrl || match.openAccessPdf?.url || null,
      };
    });

    return { papers: enriched, ok: true };
  } catch (error) {
    return {
      papers,
      ok: false,
      note:
        error instanceof Error && error.name === "AbortError"
          ? "Semantic Scholar timed out"
          : "Semantic Scholar unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}
