/**
 * Shapes the assistant returns to the browser.
 *
 * The answer is deliberately NOT a blob of prose. It is a small object the UI
 * renders as separate blocks — the written answer, the papers it cites, the
 * ResearchGram members working on the topic — so the result reads as organised
 * findings rather than a chat transcript.
 */

import type { Paper } from "@/lib/scholar/types";

export type MemberMatch = {
  id: string;
  fullName: string;
  department: string | null;
  userRole: string | null;
  academicLevel: string | null;
  profilePicUrl: string | null;
  /** Why this person surfaced — shown under their name, never invented. */
  reason: string;
  /** How many of their posted papers matched the topic. */
  matchingPostCount: number;
  mentorshipAvailable: boolean;
};

/** What kind of question the user asked, so the UI can render the right block. */
export type AnswerKind =
  | "research"
  | "product_help"
  /** Answered from the model's own knowledge, with no paper behind it. The UI
   *  must say so — an unsourced answer that looks sourced is the worst outcome
   *  a research tool can produce. */
  | "general_knowledge"
  | "chit_chat"
  | "unclear";

export type AssistantAnswer = {
  kind: AnswerKind;
  /** 3-5 sentences. Contains [1] [2] markers that index into `papers`. */
  answer: string;
  /** Only papers the model actually cited, in citation order. */
  papers: Paper[];
  /**
   * True while the answer is still being written and `papers` are therefore the
   * raw search results, not the cited subset. The UI titles the block
   * differently so it never claims a paper was cited before anything cited it.
   */
  papersPending?: boolean;
  /** Members working on this topic, ranked. Empty when nobody matches. */
  members: MemberMatch[];
  /** Follow-up searches the user can click. */
  relatedQueries: string[];
  /** Total works matching in OpenAlex, for the "see all" link. */
  totalFound: number;
  /** The query actually searched, which may differ from what the user typed. */
  searchedFor: string;
  diagnostics: {
    tookMs: number;
    notes: string[];
  };
};

export type AssistantTurn = {
  id: string;
  question: string;
  status: "pending" | "done" | "error";
  answer: AssistantAnswer | null;
  errorMessage: string | null;
  /** What the server is doing right now, while status is "pending". */
  stage?: AssistantStage;
};

export type AssistantStage = "routing" | "searching" | "writing";

/**
 * One line of the NDJSON the assistant route streams back.
 *
 * Newline-delimited JSON rather than server-sent events: every event here is a
 * whole JSON object, the client reads it with a plain fetch reader, and there is
 * no event-name or retry semantics to honour. SSE would be ceremony.
 */
export type AssistantEvent =
  | { type: "status"; stage: AssistantStage }
  | {
      type: "papers";
      papers: Paper[];
      totalFound: number;
      searchedFor: string;
    }
  | { type: "members"; members: MemberMatch[] }
  /** The answer text SO FAR — cumulative, so the client just assigns it. */
  | { type: "answer_progress"; text: string }
  | { type: "done"; answer: AssistantAnswer }
  | { type: "error"; message: string };
