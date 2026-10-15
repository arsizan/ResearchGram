import { supabase } from "@/lib/supabase";

/*
 * ResearchGram's own error log (Phase 5). Errors in the browser go to
 * public.report_error(); admins see them in /admin. Only what helps fixing the
 * problem is sent: the error message, a short stack trace, the page path
 * without the part after "?", and the browser. Never page content. Ids, email
 * addresses, sign-in tokens and the part of a web address after "?" are
 * blanked out here, and again by the database.
 *
 * Only production builds report (the development server would fill the log
 * with half-written code). Never throws.
 */

const MAX_REPORTS_PER_PAGE_LOAD = 10;
let sent = 0;
const seen = new Set<string>();

// Messages that say nothing about ResearchGram itself.
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError/i,
  /aborted a request/i,
  /NEXT_REDIRECT/,
  /NEXT_NOT_FOUND/,
  /ChunkLoadError|Loading chunk [\w-]+ failed/i,
];

const EXTENSION_CODE = /(chrome|moz|safari(-web)?)-extension:\/\//;

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Blanks out what could identify someone (the database does the same). */
function redact(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+(\.[\w-]*)?/g, "[token]")
    .replace(/[\w.%+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(ID, ":id")
    .replace(/\?[^\s)'":#]+/g, "");
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack || "" };
  }
  if (typeof error === "string") return { message: error, stack: "" };
  if (error && typeof error === "object" && "message" in error) {
    return { message: String((error as { message: unknown }).message), stack: "" };
  }
  // Never the object itself: it could hold someone's data.
  return { message: `Non-error value thrown: ${Object.prototype.toString.call(error)}`, stack: "" };
}

export function reportError(error: unknown, options: { digest?: string } = {}) {
  try {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;

    const described = describe(error);
    const text = redact(described.message.slice(0, 2000)).trim();
    const stack = redact(described.stack.slice(0, 6000));
    if (!text || IGNORED.some((pattern) => pattern.test(text))) return;
    // Errors thrown by browser extensions are not ours to fix.
    if (EXTENSION_CODE.test(stack)) return;

    const path = window.location.pathname.replace(ID, ":id");
    const key = `${text}|${path}`;
    if (seen.has(key) || sent >= MAX_REPORTS_PER_PAGE_LOAD) return;
    seen.add(key);
    sent += 1;

    void supabase
      .rpc("report_error", {
        p_source: "browser",
        p_message: text.slice(0, 300),
        p_stack: stack.slice(0, 2000) || null,
        p_path: path,
        p_digest: options.digest ?? null,
        p_user_agent: navigator.userAgent.slice(0, 300),
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // An error report must never cause a second error.
  }
}
