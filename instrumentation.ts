import type { Instrumentation } from "next";

/*
 * Errors on the server (a page or API route that failed while rendering or
 * running, or proxy.ts) go to ResearchGram's error log (Phase 5), the same
 * place as browser errors: public.report_error(), shown in /admin.
 *
 * Sent with the public (publishable) key, like a signed-out visitor: no secret
 * key is needed and none is stored on the server. Only the error message, the
 * page path without the part after "?", and where it happened. Never throws,
 * and gives up after 2 seconds.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || process.env.NODE_ENV !== "production") return;

  try {
    const e = (error && typeof error === "object" ? error : { message: String(error) }) as {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
      digest?: unknown;
    };
    const name = typeof e.name === "string" && e.name ? e.name : "Error";
    const message = typeof e.message === "string" ? e.message : String(error);

    const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
    // Older JWT-style keys also go in the Authorization header; the newer
    // sb_publishable_ keys must not.
    if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;

    await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/report_error`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_source: "server",
        p_message: `${name}: ${message}`.slice(0, 500),
        p_stack: typeof e.stack === "string" ? e.stack.slice(0, 4000) : null,
        p_path: String(request.path || "").split("?")[0],
        p_digest: typeof e.digest === "string" ? e.digest : null,
        p_user_agent: `${context.routeType} ${context.routePath}`.slice(0, 300),
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // An error report must never cause a second error.
  }
};
