/**
 * Server-side auth for route handlers.
 *
 * The browser sends its access token as a Bearer header and it is checked
 * against Supabase here. Since Phase 4 the session also lives in cookies
 * (audit RG-01, see proxy.ts), but the API routes keep requiring the explicit
 * header: a request another website makes the browser send carries the
 * cookies, never this header, so these routes cannot be triggered cross-site.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type AuthedUser = { id: string; email: string | null; accessToken: string };

export async function getUserFromRequest(
  request: Request,
): Promise<AuthedUser | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token) return null;

  // No session persistence: this client exists only to verify one token.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null, accessToken: token };
}

/**
 * A Supabase client that acts AS the signed-in user, so Row Level Security is
 * enforced exactly as it would be in their browser.
 *
 * Server code must never fall back to the plain anon client for user data: with
 * no session attached it reads as an anonymous visitor, which either returns
 * nothing or — if a policy is too loose — returns everyone's rows. Neither is
 * what we want, and the second is how leaks happen.
 */
export function createUserScopedClient(accessToken: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are not set");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Per-user rate limit, held in process memory.
 *
 * Good enough for a demo and for a single serverless instance; it resets on cold
 * start and does not coordinate across instances. Before this feature carries real
 * traffic, move the counter into Postgres so the limit is actually enforced.
 */
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

/**
 * Separate budgets per feature. Literature search only costs someone else's free
 * API; the assistant costs real tokens, so it gets a tighter allowance.
 */
const LIMITS: Record<string, number> = {
  search: 20,
  assistant: 15,
};

export function checkRateLimit(
  userId: string,
  bucket: keyof typeof LIMITS | string = "search",
): {
  allowed: boolean;
  remaining: number;
  resetsInSeconds: number;
} {
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const max = LIMITS[bucket] ?? 20;
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= max) {
    const oldest = Math.min(...recent);
    return {
      allowed: false,
      remaining: 0,
      resetsInSeconds: Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    };
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > 5000) {
    for (const [entry, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(entry);
    }
  }

  return {
    allowed: true,
    remaining: max - recent.length,
    resetsInSeconds: Math.ceil(WINDOW_MS / 1000),
  };
}
