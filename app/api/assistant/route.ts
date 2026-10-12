/**
 * POST /api/assistant   { question: string }  ->  NDJSON stream
 *
 * The one endpoint behind the assistant panel. It retrieves, writes and matches,
 * then hands back a structured answer the UI renders as separate blocks.
 *
 * Order matters here: papers are retrieved BEFORE the model is called, and the
 * model only ever sees what we retrieved. It is never asked what it knows, only
 * to summarise what is in front of it. That is the whole defence against a
 * fabricated citation.
 *
 * The response is streamed because that order has a cost: a real answer takes
 * the better part of twenty seconds, and holding all of it back until the last
 * step finishes means twenty seconds of blank panel. Now the papers appear at
 * about four seconds and the answer writes itself into view after them. The work
 * takes exactly as long; the waiting is what changes.
 *
 * Rejections that happen before any work starts — not signed in, rate limited, a
 * question that is empty or too long — are still plain JSON with a real status
 * code. Only the successful path streams.
 */

import { searchPapers } from "@/lib/scholar";
import { findMembersForTopic } from "@/lib/scholar/members";
import { writeResearchAnswer } from "@/lib/ai/researchAnswer";
import { classifyQuestion } from "@/lib/ai/intent";
import { readCachedAnswer, writeCachedAnswer } from "@/lib/ai/answerCache";
import { AiError } from "@/lib/ai/provider";
import {
  checkRateLimit,
  createUserScopedClient,
  getUserFromRequest,
} from "@/lib/serverAuth";
import type { AssistantAnswer, AssistantEvent } from "@/lib/ai/types";

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

  // Asked recently? Then it costs no model call — so it costs no quota either.
  // Checked before the rate limit on purpose: a malformed body, an empty
  // question or a free cache hit used to burn one of the user's fifteen.
  const cached = readCachedAnswer(question);

  let rateLimitRemaining = "cached";

  if (!cached) {
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

    rateLimitRemaining = String(limit.remaining);
  }

  const notes: string[] = [];
  const encoder = new TextEncoder();

  // Declared out here so cancel() can set it. Inside start() it would be
  // invisible to the very handler whose job is to say "stop".
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /**
       * Enqueue, unless the consumer has gone.
       *
       * A closed tab cancels the stream, and every later enqueue then throws
       * "Invalid state: Controller is already closed". That TypeError used to
       * escape through the Gemini adapter as "Could not reach Gemini", be
       * re-thrown by the catch below into another dead enqueue, and finally
       * reject start() — three failures and a log line blaming an outage that
       * never happened. The flag covers the normal case; the try covers the race
       * where cancel() lands mid-await.
       */
      const send = (event: AssistantEvent) => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;

        try {
          controller.close();
        } catch {
          // Already gone. Nothing to do and nothing worth logging.
        }
      };

      // The user navigated away or closed the panel. Stop paying for an answer
      // nobody is waiting for.
      const onAbort = () => {
        closed = true;
      };
      request.signal.addEventListener("abort", onAbort);

      /** Matches members to a topic. Never throws — an empty list is fine. */
      const matchMembers = async (topic: string) => {
        try {
          const supabase = createUserScopedClient(user.accessToken);

          const { data: viewer } = await supabase
            .from("profiles")
            .select("department")
            .eq("id", user.id)
            .maybeSingle();

          return await findMembersForTopic({
            supabase,
            query: topic,
            excludeUserId: user.id,
            viewerDepartment:
              (viewer as { department?: string | null } | null)?.department ??
              null,
          });
        } catch (error) {
          notes.push("member matching unavailable");
          console.error("ASSISTANT MEMBER MATCH FAILED:", error);
          return [];
        }
      };

      try {
        // 0. Cached. Members are still matched live — they depend on who asks.
        if (cached) {
          if (cached.papers.length > 0) {
            send({
              type: "papers",
              papers: cached.papers,
              totalFound: cached.totalFound,
              searchedFor: cached.searchedFor,
            });
          }

          const members =
            cached.kind === "research"
              ? await matchMembers(cached.searchedFor)
              : [];

          send({
            type: "done",
            answer: {
              ...cached,
              members,
              diagnostics: {
                tookMs: Date.now() - startedAt,
                notes: [...notes, "answered from cache"],
              },
            },
          });

          finish();
          return;
        }

        // 1. Work out what was actually asked. A greeting or a "how do I post a
        //    paper?" is answered here and never touches OpenAlex.
        send({ type: "status", stage: "routing" });

        const routed = await classifyQuestion(question);
        if (routed.degraded) notes.push("routing unavailable — searched anyway");

        if (routed.intent !== "research") {
          const kind: AssistantAnswer["kind"] =
            routed.intent === "product_help"
              ? "product_help"
              : routed.intent === "general_knowledge"
                ? "general_knowledge"
                : routed.intent === "chit_chat"
                  ? "chit_chat"
                  : "unclear";

          const shortAnswer = {
            kind,
            answer: routed.reply,
            papers: [],
            relatedQueries: routed.relatedQueries,
            totalFound: 0,
            searchedFor: question,
          };

          writeCachedAnswer(question, shortAnswer);

          send({
            type: "done",
            answer: {
              ...shortAnswer,
              members: [],
              diagnostics: {
                tookMs: Date.now() - startedAt,
                notes: [...notes, `intent: ${routed.intent}`],
              },
            },
          });

          finish();
          return;
        }

        // 2. Retrieve. The model never speaks without evidence in hand.
        send({ type: "status", stage: "searching" });

        const search = await searchPapers(routed.searchQuery, { perPage: 40 });
        notes.push(...search.diagnostics.notes);

        if (search.papers.length === 0) {
          // Not an error. Nothing failed — the literature simply has nothing
          // under those words, and a red box would say otherwise.
          send({
            type: "done",
            answer: {
              kind: "unclear",
              answer: `I could not find any papers on "${routed.searchQuery}". Try different words, or a broader topic.`,
              papers: [],
              members: [],
              relatedQueries: [],
              totalFound: 0,
              searchedFor: routed.searchQuery,
              diagnostics: {
                tookMs: Date.now() - startedAt,
                notes: [...notes, "no matches"],
              },
            },
          });

          finish();
          return;
        }

        // Show what was found straight away. These are search results, not
        // citations — the client labels them as such until the answer lands.
        send({
          type: "papers",
          papers: search.papers.slice(0, 8),
          totalFound: search.totalFound,
          searchedFor: routed.searchQuery,
        });

        // 3. Members do not depend on the answer and must not wait behind it.
        //    Started here, delivered whenever it lands.
        let members: AssistantAnswer["members"] = [];

        const membersDone = matchMembers(routed.searchQuery).then((found) => {
          members = found;
          if (found.length > 0) send({ type: "members", members: found });
        });

        // 4. Write, reporting the text as it arrives.
        send({ type: "status", stage: "writing" });

        const written = await writeResearchAnswer(
          question,
          search.papers,
          (textSoFar) => send({ type: "answer_progress", text: textSoFar }),
        );

        await membersDone;

        if (written.droppedCitations > 0) {
          // Worth knowing about: the model reached for something that was not
          // there, and the guard caught it.
          notes.push(
            `${written.droppedCitations} invented citation(s) removed before display`,
          );
          console.warn(
            `ASSISTANT: dropped ${written.droppedCitations} invalid citation(s) (question of ${question.length} characters)`,
          );
        }

        const finalAnswer = {
          kind: written.kind,
          answer: written.answer,
          // Cited papers lead; the rest stay on the Discover page behind
          // "see all".
          papers: written.citedPapers,
          relatedQueries: written.relatedQueries,
          totalFound: search.totalFound,
          // The Discover link gets the keywords that actually produced these
          // results, not the sentence the user typed.
          searchedFor: routed.searchQuery,
        };

        writeCachedAnswer(question, finalAnswer);

        send({
          type: "done",
          answer: {
            ...finalAnswer,
            members,
            diagnostics: { tookMs: Date.now() - startedAt, notes },
          },
        });
      } catch (error) {
        console.error("ASSISTANT FAILED:", error);

        const status = error instanceof AiError ? error.status : 502;

        send({
          type: "error",
          message:
            status === 429
              ? "The assistant has used up its AI quota for now. Search still works from the Discover page."
              : status === 504
                ? "That took too long. Try a shorter question."
                : "Something went wrong answering that. Please try again.",
        });
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        finish();
      }
    },

    cancel() {
      // The consumer went away — a closed tab, a navigation. Nothing after this
      // may touch the controller, and this is the flag `send` and `finish`
      // check, so the work already in flight finishes quietly instead of
      // throwing into a stream that is not there.
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Tells proxies not to buffer, which would undo the whole point.
      "X-Accel-Buffering": "no",
      "X-RateLimit-Remaining": rateLimitRemaining,
    },
  });
}
