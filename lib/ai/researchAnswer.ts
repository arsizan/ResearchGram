/**
 * Turns a set of retrieved papers into a written, cited answer.
 *
 * Two design decisions carry most of the weight here:
 *
 * 1. The model cites papers by their POSITION in the list we hand it (1, 2, 3),
 *    not by OpenAlex id. A model asked to echo "W2741809807" will eventually get
 *    a character wrong; a model asked for "2" cannot. Validation then becomes a
 *    range check instead of a string match.
 *
 * 2. Anything the model returns that does not survive validation is dropped, not
 *    repaired. A fabricated citation in a research tool is the one failure that
 *    destroys trust, so the safe direction is always "show less".
 */

import { generateStructured } from "./provider";
import type { Paper } from "@/lib/scholar/types";
import type { AnswerKind } from "./types";

const SYSTEM = `You are the research assistant inside ResearchGram, an academic
collaboration platform used mainly by undergraduate and postgraduate students.

You will be given a user's question and a numbered list of real papers retrieved
from OpenAlex. Write a short, direct answer to the question using ONLY those
papers.

Rules you must follow:
- Ground every factual claim in the numbered papers. Cite as [1], [2], and so on,
  matching the numbers you were given.
- Never mention a paper that is not in the list. Never invent a title, author,
  finding or number.
- If the papers do not actually answer the question, say so plainly in one or two
  sentences instead of padding.
- Write for a student who is new to the field: plain language, no jargon you do
  not explain, 3 to 5 sentences.
- Do not open with pleasantries, do not restate the question, do not offer to
  help further. Start with the substance.
- If the question is about using ResearchGram itself (posting a paper, finding
  collaborators, requesting access) rather than about research, set kind to
  "product_help" and answer briefly from general knowledge with no citations.
- If the question is too vague to search, set kind to "unclear" and say what
  detail would help.`;

const TOOL = {
  name: "present_research_answer",
  description:
    "Present the answer to the user's research question, grounded in the numbered papers provided.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["research", "product_help", "unclear"],
        description:
          "research = answered from the papers; product_help = about using ResearchGram; unclear = question too vague to search.",
      },
      answer: {
        type: "string",
        description:
          "3-5 sentences answering the question, with [n] citation markers matching the numbered papers. No preamble.",
      },
      cited_papers: {
        type: "array",
        items: { type: "integer" },
        description:
          "The paper numbers actually cited in the answer, in the order they first appear. Empty for product_help or unclear.",
      },
      related_queries: {
        type: "array",
        items: { type: "string" },
        description:
          "2 to 4 short follow-up searches a curious reader would run next. Plain search phrases, not questions.",
      },
    },
    required: ["kind", "answer", "cited_papers", "related_queries"],
  },
} as const;

type RawAnswer = {
  kind?: string;
  answer?: string;
  cited_papers?: unknown;
  related_queries?: unknown;
};

/** Trim an abstract so twelve of them still fit comfortably in one request. */
function abstractFor(paper: Paper): string {
  const text = paper.tldr || paper.abstract || "";
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

function buildUserMessage(question: string, papers: Paper[]): string {
  const list = papers
    .map((paper, index) => {
      const authors = paper.authors
        .slice(0, 3)
        .map((author) => author.name)
        .join(", ");

      return [
        `[${index + 1}] ${paper.title}`,
        `Authors: ${authors || "unknown"}${paper.authors.length > 3 ? " et al." : ""}`,
        `Year: ${paper.year ?? "unknown"} | Venue: ${paper.journal?.name ?? "unknown"} | Citations: ${paper.citationCount}`,
        `Summary: ${abstractFor(paper) || "(no abstract available)"}`,
      ].join("\n");
    })
    .join("\n\n");

  return `Question: ${question}\n\nPapers:\n\n${list}`;
}

export type ResearchAnswer = {
  kind: AnswerKind;
  answer: string;
  /** Papers actually cited, reordered to match the [n] markers in `answer`. */
  citedPapers: Paper[];
  relatedQueries: string[];
  /** Set when the model cited papers that did not exist in the input. */
  droppedCitations: number;
};

const VALID_KINDS: AnswerKind[] = ["research", "product_help", "unclear"];

export async function writeResearchAnswer(
  question: string,
  papers: Paper[],
): Promise<ResearchAnswer> {
  const shortlist = papers.slice(0, 12);

  const raw = await generateStructured<RawAnswer>({
    system: SYSTEM,
    userMessage: buildUserMessage(question, shortlist),
    tool: TOOL as unknown as {
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
    },
  });

  const kind: AnswerKind =
    typeof raw.kind === "string" && (VALID_KINDS as string[]).includes(raw.kind)
      ? (raw.kind as AnswerKind)
      : "research";

  const answerText =
    typeof raw.answer === "string" && raw.answer.trim()
      ? raw.answer.trim()
      : "I could not put together an answer from the papers I found.";

  // Validation. Every citation must be an integer pointing at a paper we
  // actually retrieved; anything else is discarded rather than guessed at.
  const requested = Array.isArray(raw.cited_papers) ? raw.cited_papers : [];
  const seen = new Set<number>();
  const citedPapers: Paper[] = [];
  const citedOriginalIndexes: number[] = [];
  let dropped = 0;

  for (const value of requested) {
    const index = Number(value);

    if (!Number.isInteger(index) || index < 1 || index > shortlist.length) {
      dropped += 1;
      continue;
    }

    if (seen.has(index)) continue;
    seen.add(index);
    citedOriginalIndexes.push(index);
    citedPapers.push(shortlist[index - 1]);
  }

  const relatedQueries = (
    Array.isArray(raw.related_queries) ? raw.related_queries : []
  )
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && item.length < 120)
    .slice(0, 4);

  return {
    kind,
    // Renumbered here rather than by the caller: markers and papers must never
    // be able to drift apart.
    answer: renumberCitations(answerText, citedOriginalIndexes),
    citedPapers,
    relatedQueries,
    droppedCitations: dropped,
  };
}

/**
 * Renumber the [n] markers so they match the validated list.
 *
 * If the model cited papers 2, 5 and 9 we now show three papers, so the text has
 * to say [1], [2], [3]. Markers pointing at dropped papers are removed entirely
 * rather than left dangling.
 */
function renumberCitations(
  answer: string,
  citedOriginalIndexes: number[],
): string {
  const mapping = new Map<number, number>();
  citedOriginalIndexes.forEach((original, position) => {
    mapping.set(original, position + 1);
  });

  return answer.replace(/\[(\d+)\]/g, (match, digits) => {
    const next = mapping.get(Number(digits));
    return next ? `[${next}]` : "";
  });
}
