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

import { generateStructured, generateStructuredStream } from "./provider";
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
    // Order matters: Gemini generates properties in this order, and the panel
    // can only stream text once "answer" has started. It goes first.
    properties: {
      answer: {
        type: "string",
        description:
          "3-5 sentences answering the question, with [n] citation markers matching the numbered papers. No preamble.",
      },
      kind: {
        type: "string",
        enum: ["research", "product_help", "unclear"],
        description:
          "research = answered from the papers; product_help = about using ResearchGram; unclear = question too vague to search.",
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
    required: ["answer", "kind", "cited_papers", "related_queries"],
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

/**
 * Hide citation markers while the text is still arriving.
 *
 * The [n] in the model's draft point at the numbered list it was given; they are
 * renumbered at the end against the papers that survived validation. A marker
 * shown mid-stream would therefore change its number under the reader, or turn
 * out to point at a paper that was dropped. Plain prose now, real clickable
 * markers when the answer is final.
 */
function stripCitationMarkers(text: string): string {
  return tidy(
    text
      .replace(CITATION_MARKER, "")
      // A marker the model is halfway through writing.
      .replace(/\s*\[[\d,\s]*$/, ""),
  );
}

export async function writeResearchAnswer(
  question: string,
  papers: Paper[],
  /**
   * When given, the answer text is reported as it is written. Cumulative: each
   * call carries the whole text so far, not the newest fragment.
   */
  onPartial?: (textSoFar: string) => void,
): Promise<ResearchAnswer> {
  const shortlist = papers.slice(0, 12);

  const request = {
    system: SYSTEM,
    userMessage: buildUserMessage(question, shortlist),
    tool: TOOL as unknown as {
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
    },
  };

  const raw = onPartial
    ? await generateStructuredStream<RawAnswer>({
        ...request,
        partialField: "answer",
        onPartial: (text) => onPartial(stripCitationMarkers(text)),
      })
    : await generateStructured<RawAnswer>(request);

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
  //
  // The ANSWER TEXT is what decides which papers are cited, not the model's
  // cited_papers list. Two reasons: a number in the list that never appears in
  // the prose would put a paper under "Papers cited" with nothing citing it, and
  // the order papers are shown in has to be the order they are referred to. The
  // list is only used when the prose contains no usable marker at all.
  const inRange = (index: number) =>
    Number.isInteger(index) && index >= 1 && index <= shortlist.length;

  const unique = (indexes: number[]) => [...new Set(indexes)];

  const markersInText = extractMarkerIndexes(answerText);
  const listedByModel = (Array.isArray(raw.cited_papers) ? raw.cited_papers : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const fromText = unique(markersInText.filter(inRange));
  const fromList = unique(listedByModel.filter(inRange));

  const citedOriginalIndexes = fromText.length > 0 ? fromText : fromList;
  const citedPapers: Paper[] = citedOriginalIndexes.map(
    (index) => shortlist[index - 1],
  );

  // Anything the model reached for that was not there. Counted, not repaired:
  // a fabricated citation in a research tool is the one failure that destroys
  // trust, so the safe direction is always "show less".
  const dropped =
    unique(markersInText).filter((index) => !inRange(index)).length +
    unique(listedByModel).filter((index) => !inRange(index)).length;

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
 * One citation marker: [3], and also [3, 7] and [1,2].
 *
 * The prompt asks for one number per bracket and the model mostly complies, but
 * "mostly" is not a validation strategy. A grouped marker that this did not
 * match used to survive renumbering untouched — so [3, 7] stayed [3, 7] while
 * everything around it was rewritten, and it then pointed at two completely
 * different papers in the list the reader was shown.
 *
 * The leading \s* is consumed so a marker that gets dropped does not leave a
 * space stranded before the full stop. Surviving markers put one space back.
 */
const CITATION_MARKER = /\s*\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/g;

function extractMarkerIndexes(answer: string): number[] {
  const found: number[] = [];

  for (const match of answer.matchAll(CITATION_MARKER)) {
    for (const part of match[1].split(",")) {
      const index = Number(part.trim());
      if (Number.isInteger(index)) found.push(index);
    }
  }

  return found;
}

/** Tidy the seams left by removing or rewriting markers mid-sentence. */
function tidy(text: string): string {
  return text
    .replace(/ {2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Renumber the markers so they match the validated list.
 *
 * If the model cited papers 2, 5 and 9 we now show three papers, so the text has
 * to say [1], [2], [3]. Markers pointing at dropped papers are removed entirely
 * rather than left dangling, and a grouped marker is split into one bracket per
 * paper — the UI only makes single-number markers clickable, and separate chips
 * are what a reader can act on anyway.
 */
function renumberCitations(
  answer: string,
  citedOriginalIndexes: number[],
): string {
  const mapping = new Map<number, number>();
  citedOriginalIndexes.forEach((original, position) => {
    mapping.set(original, position + 1);
  });

  return tidy(
    answer.replace(CITATION_MARKER, (_match, group: string) => {
      const renumbered = group
        .split(",")
        .map((part) => mapping.get(Number(part.trim())))
        .filter((value): value is number => typeof value === "number");

      if (renumbered.length === 0) return "";

      return ` ${renumbered.map((value) => `[${value}]`).join("")}`;
    }),
  );
}
