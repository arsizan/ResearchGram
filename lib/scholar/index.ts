/**
 * Orchestrator for a scholarly search.
 *
 * Day 1-2 of the plan: retrieval and metrics only, no LLM anywhere. That is
 * deliberate — this path has no API key, no token cost, no latency spike and no
 * possibility of a hallucination, so it is the part of the demo that cannot fail.
 * The answer-synthesis layer is added on top of this later, not woven into it.
 */

import { fetchJournalMetrics, searchWorks } from "./openalex";
import { enrichWithSemanticScholar } from "./semanticScholar";
import type { Paper, SearchResult } from "./types";

export type { Paper, SearchResult } from "./types";

export type SearchOptions = {
  perPage?: number;
  fromYear?: number;
  openAccessOnly?: boolean;
};

/**
 * Provisional ordering for Day 1-2: relevance from OpenAlex, nudged by citations
 * and recency. Day 5 replaces the first term with embedding similarity — the
 * weights live here so the change is one function, and so the effect of each
 * weight can be demonstrated.
 */
const WEIGHTS = {
  openAlexRank: 0.55,
  citations: 0.25,
  recency: 0.15,
  openAccess: 0.05,
} as const;

function scorePapers(papers: Paper[]): Paper[] {
  const currentYear = new Date().getFullYear();
  const maxCitations = Math.max(...papers.map((p) => p.citationCount), 1);

  return [...papers]
    .map((paper, index) => {
      // OpenAlex returns most-relevant first; convert position to a 0-1 score.
      const rankScore = 1 - index / Math.max(papers.length, 1);

      const citationScore =
        Math.log10(paper.citationCount + 1) / Math.log10(maxCitations + 1);

      const age = paper.year ? currentYear - paper.year : 30;
      const recencyScore = Math.max(0, 1 - age / 20);

      const score =
        WEIGHTS.openAlexRank * rankScore +
        WEIGHTS.citations * citationScore +
        WEIGHTS.recency * recencyScore +
        WEIGHTS.openAccess * (paper.isOpenAccess ? 1 : 0);

      return { paper, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.paper);
}

/** How long the optional enrichment step may take, in total. */
const ENRICHMENT_CEILING_MS = 10000;

/**
 * Resolve with `fallback` if `work` has not finished in time.
 *
 * The work is not cancelled — there is nothing useful to cancel it with here,
 * and it will settle harmlessly on its own. What matters is that the caller
 * stops waiting.
 */
function withCeiling<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function searchPapers(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const startedAt = Date.now();
  const notes: string[] = [];

  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query: "",
      totalFound: 0,
      papers: [],
      diagnostics: {
        openAlexOk: true,
        journalMetricsOk: true,
        semanticScholarOk: true,
        tookMs: 0,
        notes: ["empty query"],
      },
    };
  }

  // 1. Retrieve. If this fails there is nothing to show, so it is the only throw.
  const { papers: found, totalFound } = await searchWorks(trimmed, {
    perPage: options.perPage ?? 40,
    fromYear: options.fromYear,
    openAccessOnly: options.openAccessOnly,
  });

  if (found.length === 0) {
    return {
      query: trimmed,
      totalFound,
      papers: [],
      diagnostics: {
        openAlexOk: true,
        journalMetricsOk: true,
        semanticScholarOk: true,
        tookMs: Date.now() - startedAt,
        notes: ["no matches"],
      },
    };
  }

  // 2 and 3 are independent enrichments — run them together, tolerate either failing.
  const sourceIds = found
    .map((paper) => paper.journal?.openalexSourceId)
    .filter((id): id is string => Boolean(id));

  // Enrichment is optional by design, so it gets a hard ceiling as a whole
  // rather than trusting each adapter to police itself. Two upstream services
  // with their own retries sit behind this; without the ceiling a slow one can
  // spend the serverless function's entire remaining budget on a summary the
  // user did not ask for, and the platform kills the request mid-answer.
  const [metricsResult, s2Result] = await withCeiling(
    Promise.allSettled([
      fetchJournalMetrics(sourceIds),
      enrichWithSemanticScholar(found),
    ]),
    ENRICHMENT_CEILING_MS,
    [
      { status: "rejected", reason: new Error("enrichment timed out") },
      { status: "rejected", reason: new Error("enrichment timed out") },
    ],
  );

  let papers = found;
  let journalMetricsOk = true;
  let semanticScholarOk = true;

  if (s2Result.status === "fulfilled") {
    papers = s2Result.value.papers;
    semanticScholarOk = s2Result.value.ok;
    if (s2Result.value.note) notes.push(s2Result.value.note);
  } else {
    semanticScholarOk = false;
    notes.push("Semantic Scholar enrichment failed");
  }

  if (metricsResult.status === "fulfilled") {
    const metrics = metricsResult.value;
    papers = papers.map((paper) => {
      const sourceId = paper.journal?.openalexSourceId;
      const extra = sourceId ? metrics.get(sourceId) : undefined;
      if (!paper.journal || !extra) return paper;
      return { ...paper, journal: { ...paper.journal, ...extra } };
    });
  } else {
    journalMetricsOk = false;
    notes.push("journal metrics unavailable — titles and citations still shown");
  }

  return {
    query: trimmed,
    totalFound,
    papers: scorePapers(papers),
    diagnostics: {
      openAlexOk: true,
      journalMetricsOk,
      semanticScholarOk,
      tookMs: Date.now() - startedAt,
      notes,
    },
  };
}
