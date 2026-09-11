/**
 * Decides what the user actually asked before anything expensive happens.
 *
 * Without this step every message triggers a literature search — "hello" included
 * — which is slow, wastes OpenAlex credits, and produces a nonsense answer built
 * out of whatever 40 papers happened to match a greeting.
 *
 * So one cheap call routes the message first. Only `research` goes on to search.
 * The other three are answered right here, in the same call that classified them,
 * so an ordinary reply costs one round trip instead of three.
 *
 * It also rewrites the question into search keywords. `toOpenAlexQuery()` in the
 * OpenAlex adapter is a regex and stays as the last line of defence, but a model
 * reading "papers about detecting sick rice plants from photos" can produce
 * "rice leaf disease detection deep learning", which no regex will.
 */

import { generateStructured } from "./provider";
import { AiError } from "./errors";

const SYSTEM = `You are the router in front of ResearchGram's research assistant.
ResearchGram is an academic collaboration platform for university students and
faculty. Members publish research notes and papers, control who may read a full
paper, request and offer collaboration, find mentors, run project workspaces, and
message each other. Its main pages are Feed, Discover (literature search),
Researchers, Network, Requests and Messages.

Classify the user's message into exactly one intent:

- "research" — they want to know something about a research topic, a field, a
  method, or the published literature. This is the common case.
- "product_help" — they are asking how to do something on ResearchGram itself.
- "chit_chat" — a greeting, thanks, small talk, or a question about you.
- "too_vague" — they clearly want research but gave nothing searchable, such as a
  bare "papers" or "help me with my project".

Then:

- For "research": put good search keywords in search_query — the topic words a
  librarian would type, no question words, no filler, 3 to 8 words. Leave reply
  empty.
- For every other intent: write the reply yourself, 1 to 3 short sentences, warm
  and plain. Leave search_query empty. For product_help answer only from the
  description of ResearchGram above; if you do not know, say so and suggest they
  look on the relevant page. For too_vague, name the one detail that would let you
  search.
- Never claim to have found papers. You have not searched anything.
- related_queries: 2 to 4 short topic phrases they might want next. Leave empty
  for chit_chat.`;

const TOOL = {
  name: "route_question",
  description:
    "Classify the user's message and, unless it needs a literature search, answer it.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["research", "product_help", "chit_chat", "too_vague"],
        description: "Which of the four kinds of message this is.",
      },
      search_query: {
        type: "string",
        description:
          "Search keywords for a research question. Empty string for every other intent.",
      },
      reply: {
        type: "string",
        description:
          "The answer, for product_help, chit_chat and too_vague. Empty string for research.",
      },
      related_queries: {
        type: "array",
        items: { type: "string" },
        description: "2-4 short follow-up topic phrases. Empty for chit_chat.",
      },
    },
    required: ["intent", "search_query", "reply", "related_queries"],
  },
} as const;

export type Intent = "research" | "product_help" | "chit_chat" | "too_vague";

export type RoutedQuestion = {
  intent: Intent;
  /** Keywords to search with. Falls back to the raw question. */
  searchQuery: string;
  /** Filled for everything except `research`. */
  reply: string;
  relatedQueries: string[];
  /** True when routing failed and we defaulted to searching. */
  degraded: boolean;
};

const VALID: Intent[] = ["research", "product_help", "chit_chat", "too_vague"];

type RawRoute = {
  intent?: unknown;
  search_query?: unknown;
  reply?: unknown;
  related_queries?: unknown;
};

export async function classifyQuestion(
  question: string,
): Promise<RoutedQuestion> {
  try {
    const raw = await generateStructured<RawRoute>({
      system: SYSTEM,
      userMessage: question,
      tool: TOOL as unknown as {
        name: string;
        description: string;
        input_schema: Record<string, unknown>;
      },
      // Routing is a short answer. A small budget keeps it fast and stops a
      // thinking model from spending the whole allowance deliberating.
      maxTokens: 1200,
      timeoutMs: 15000,
      // Optional: a smaller, faster model just for this step. Unset means the
      // same model as everything else, which is the safe default.
      model: process.env.GEMINI_FAST_MODEL || undefined,
    });

    const intent: Intent =
      typeof raw.intent === "string" && (VALID as string[]).includes(raw.intent)
        ? (raw.intent as Intent)
        : "research";

    const searchQuery =
      typeof raw.search_query === "string" && raw.search_query.trim()
        ? raw.search_query.trim()
        : question;

    const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";

    const relatedQueries = Array.isArray(raw.related_queries)
      ? raw.related_queries
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];

    // A non-research intent with no reply is useless — searching is the better
    // failure than an empty panel.
    if (intent !== "research" && !reply) {
      return {
        intent: "research",
        searchQuery,
        reply: "",
        relatedQueries,
        degraded: true,
      };
    }

    return { intent, searchQuery, reply, relatedQueries, degraded: false };
  } catch (error) {
    // Routing is an optimisation, not a gate. If it fails, fall back to what the
    // assistant did before it existed: treat everything as a research question.
    console.error(
      "ASSISTANT ROUTING FAILED:",
      error instanceof AiError ? `${error.status} ${error.message}` : error,
    );

    return {
      intent: "research",
      searchQuery: question,
      reply: "",
      relatedQueries: [],
      degraded: true,
    };
  }
}