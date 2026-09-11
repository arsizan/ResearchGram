/**
 * POST /api/assistant   { question: string }
 *
 * The one endpoint behind the assistant panel. It retrieves, writes and matches,
 * then hands back a structured answer the UI renders as separate blocks.
 *
 * Order matters here: papers are retrieved BEFORE the model is called, and the
 * model only ever sees what we retrieved. It is never asked what it knows, only
 * to summarise what is in front of it. That is the whole defence against a
 * fabricated citation.
 */

import { searchPapers } from "@/lib/scholar";
import { findMembersForTopic } from "@/lib/scholar/members";
import { writeResearchAnswer } from "@/lib/ai/researchAnswer";
import { classifyQuestion } from "@/lib/ai/intent";
import { AiError } from "@/lib/ai/provider";
import {
  checkRateLimit,
  createUserScopedClient,
  getUserFromRequest,
} from "@/lib/serverAuth";
import type { AssistantAnswer } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: "Sign in to use the research assistant." }, 401);
  }

  const limit = checkRateLimit(user.id, "assistant");
  if (!limit.allowed) {
    return json(
      {
        error: `You have used all 15 assistant questions for this hour. Try again in ${Math.ceil(
          limit.resetsInSeconds / 60,
        )} minutes.`,
      },
      429,
      { "Retry-After": String(limit.resetsInSeconds) },
    );
  }

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return json({ error: "Could not read your question." }, 400);
  }

  if (!question) {
    return json({ error: "Ask a question to get started." }, 400);
  }

  if (question.length > 500) {
    return json({ error: "That question is too long. Keep it under 500 characters." }, 400);
  }

  const notes: string[] = [];

  try {
    // 1. Retrieve first. The model never speaks without evidence in hand.
       // 1. Work out what was actually asked. A greeting or a "how do I post a
    //    paper?" is answered here and never touches OpenAlex.
    const routed = await classifyQuestion(question);
    if (routed.degraded) notes.push("routing unavailable — searched anyway");

    if (routed.intent !== "research") {
      const kind: AssistantAnswer["kind"] =
        routed.intent === "product_help"
          ? "product_help"
          : routed.intent === "chit_chat"
            ? "chit_chat"
            : "unclear";

      return json(
        {
          kind,
          answer: routed.reply,
          papers: [],
          members: [],
          relatedQueries: routed.relatedQueries,
          totalFound: 0,
          searchedFor: routed.searchQuery,
          diagnostics: {
            tookMs: Date.now() - startedAt,
            notes: [...notes, `intent: ${routed.intent}`],
          },
        } satisfies AssistantAnswer,
        200,
        { "X-RateLimit-Remaining": String(limit.remaining) },
      );
    }

    // 2. Retrieve. The model never speaks without evidence in hand.
    const search = await searchPapers(routed.searchQuery, { perPage: 40 });
    notes.push(...search.diagnostics.notes);

    // 2. Write the answer, and match members, at the same time. Neither needs
    //    the other's result, and members must not wait on a paid API call.
    const supabase = createUserScopedClient(user.accessToken);

    const { data: viewer } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", user.id)
      .maybeSingle();

    const [answerResult, membersResult] = await Promise.allSettled([
      writeResearchAnswer(question, search.papers),
      findMembersForTopic({
        supabase,
        query: routed.searchQuery,
        excludeUserId: user.id,
        viewerDepartment: (viewer as { department?: string | null } | null)?.department ?? null,
      }),
    ]);

    if (answerResult.status === "rejected") {
      const reason = answerResult.reason;
      const status = reason instanceof AiError ? reason.status : 502;

      console.error("ASSISTANT ANSWER FAILED:", reason);

      return json(
        {
          error:
            status === 429
              ? "The assistant is busy right now. Try again in a moment."
              : "The assistant could not write an answer. Your search still works from the Discover page.",
        },
        status === 429 ? 429 : 502,
      );
    }

    const written = answerResult.value;

    if (written.droppedCitations > 0) {
      // Worth knowing about: it means the model reached for something that was
      // not there, and the guard caught it.
      notes.push(
        `${written.droppedCitations} invented citation(s) removed before display`,
      );
      console.warn(
        `ASSISTANT: dropped ${written.droppedCitations} invalid citation(s) for question: ${question.slice(0, 80)}`,
      );
    }

    const members =
      membersResult.status === "fulfilled" ? membersResult.value : [];

    if (membersResult.status === "rejected") {
      notes.push("member matching unavailable");
      console.error("ASSISTANT MEMBER MATCH FAILED:", membersResult.reason);
    }

    const payload: AssistantAnswer = {
      kind: written.kind,
      answer: written.answer,
      // Cited papers lead; the rest stay on the Discover page behind "see all".
      papers: written.citedPapers,
      members,
      relatedQueries: written.relatedQueries,
      totalFound: search.totalFound,
      searchedFor: question,
      diagnostics: { tookMs: Date.now() - startedAt, notes },
    };

    return json(payload, 200, {
      "X-RateLimit-Remaining": String(limit.remaining),
    });
  } catch (error) {
    console.error("ASSISTANT FAILED:", error);
    return json(
      { error: "Something went wrong answering that. Please try again." },
      502,
    );
  }
}
