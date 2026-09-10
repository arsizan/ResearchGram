/**
 * GET /api/research?q=...
 *
 * The first server-side code in this app. It exists here rather than in the browser
 * for a reason that becomes non-negotiable once the LLM step is added: an API key
 * must never ship to the client. Building the route now means the key has somewhere
 * to live when Day 3 arrives.
 */

import { searchPapers } from "@/lib/scholar";
import { checkRateLimit, getUserFromRequest } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();

  if (!query) {
    return json({ error: "Add a search term to get started." }, 400);
  }

  if (query.length > 300) {
    return json({ error: "That search is too long. Keep it under 300 characters." }, 400);
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: "Sign in to search the literature." }, 401);
  }

  const limit = checkRateLimit(user.id);
  if (!limit.allowed) {
    return json(
      {
        error: `You have used all 20 searches for this hour. Try again in ${Math.ceil(
          limit.resetsInSeconds / 60,
        )} minutes.`,
      },
      429,
      { "Retry-After": String(limit.resetsInSeconds) },
    );
  }

  const fromYearParam = url.searchParams.get("fromYear");
  const fromYear = fromYearParam ? Number(fromYearParam) : undefined;

  try {
    const result = await searchPapers(query, {
      perPage: 40,
      fromYear: Number.isFinite(fromYear) ? fromYear : undefined,
      openAccessOnly: url.searchParams.get("oa") === "1",
    });

    return json(result, 200, {
      "X-RateLimit-Remaining": String(limit.remaining),
    });
  } catch (error) {
    // Never surface the upstream message: it can carry internal detail, and the
    // user cannot act on it anyway.
    console.error("RESEARCH SEARCH FAILED:", error);
    return json(
      { error: "The literature index is not responding. Please try again." },
      502,
    );
  }
}
