import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Server-side sign-in check (audit RG-01).
 *
 * Runs before every page. Signed-out visitors asking for a private page are
 * sent to the login page (with ?next= to come back) before any of the page is
 * served. The data itself stays protected by row level security in the
 * database; this check is about not serving private pages to visitors at all.
 *
 * It also refreshes an expired session, so the cookies the server sees stay
 * current. When Supabase is slow, unreachable, rate-limited or failing, the
 * request is let through unchanged and the page decides, as before, instead
 * of logging everyone out.
 */

const PUBLIC_PAGES = new Set([
  "/",
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
  // Readable before signing up (linked from the sign-up form).
  "/privacy",
  "/terms",
]);

function isPublicPage(pathname: string) {
  return PUBLIC_PAGES.has(pathname) || pathname.startsWith("/auth/");
}

// Each call to Supabase Auth, and the whole check (which may retry a session
// refresh several times), have a time limit, so a slow Auth server cannot
// hold page loads.
const AUTH_FETCH_TIMEOUT_MS = 3000;
const AUTH_CHECK_DEADLINE_MS = 4000;

// A fetch that stops at the deadline. After it, no new call starts: the
// Supabase client would otherwise keep retrying a slow session refresh in the
// background, and a refresh that succeeds after the page was served replaces
// the session without the browser ever getting the new cookies. (408 is an
// answer the client does not retry.)
function fetchUntil(deadline: number): typeof fetch {
  return (input, init) => {
    const left = deadline - Date.now();
    if (left <= 0) {
      return Promise.resolve(
        new Response(JSON.stringify({ code: "request_timeout", message: "The sign-in check took too long." }), {
          status: 408,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    const timeout = AbortSignal.timeout(Math.min(AUTH_FETCH_TIMEOUT_MS, left));
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}

// Supabase Auth answered that this session is over: an invalid or forged
// token, an expired or revoked refresh token, a deleted or banned user, no
// session. Anything else (no answer, a time-out, a rate limit, a server error,
// the public keys not loading) says nothing about the session.
const SESSION_OVER_CODES = new Set([
  "bad_jwt",
  "invalid_jwt",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
  "user_banned",
]);

function sessionIsOver(error: { name?: string; code?: string } | null) {
  if (!error) return false;
  if (error.name === "AuthInvalidJwtError" || error.name === "AuthSessionMissingError") return true;
  return typeof error.code === "string" && SESSION_OVER_CODES.has(error.code);
}

type CookieChange = { name: string; value: string; options: CookieOptions };

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || isPublicPage(pathname)) return NextResponse.next();

  const hasSessionCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));

  // Signed in: true / false, or null when Supabase gave no clear answer.
  let signedIn: boolean | null = false;

  // Cookie changes (a refreshed session, or a cleared one) are only passed on
  // once the answer is clear.
  const changes: CookieChange[] = [];
  let cacheHeaders: Record<string, string> = {};

  if (hasSessionCookie) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          changes.push(...cookiesToSet);
          cacheHeaders = { ...cacheHeaders, ...(headers ?? {}) };
        },
      },
      global: { fetch: fetchUntil(Date.now() + AUTH_CHECK_DEADLINE_MS) },
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Verifies the access token (refreshing it first when it has expired).
      const result = await Promise.race([
        supabase.auth.getClaims(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), AUTH_CHECK_DEADLINE_MS);
        }),
      ]);

      if (!result) {
        signedIn = null;
      } else if (result.data?.claims?.sub) {
        signedIn = true;
      } else if (!result.error || sessionIsOver(result.error)) {
        signedIn = false;
      } else {
        signedIn = null;
      }
    } catch (error) {
      // The client throws only for a token it cannot read (broken encoding, an
      // unknown algorithm): signed out. A key the server published that cannot
      // be used is Supabase's problem, not the session's: no clear answer.
      signedIn = typeof DOMException !== "undefined" && error instanceof DOMException ? null : false;
    } finally {
      clearTimeout(timer);
    }
  }

  const withChanges = (response: NextResponse) => {
    changes.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    Object.entries(cacheHeaders).forEach(([header, value]) => response.headers.set(header, value));
    return response;
  };

  if (signedIn === true) {
    // The page sees the refreshed session too.
    return withChanges(changes.length ? NextResponse.next({ request }) : NextResponse.next());
  }

  if (signedIn === false) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    // Passes on the cleared session cookies, if any.
    return withChanges(NextResponse.redirect(loginUrl));
  }

  // No clear answer: let the request through exactly as it came.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Every page except API routes, Next.js files and files with an extension
    // (images, fonts, robots.txt, sitemap.xml, icons).
    "/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
