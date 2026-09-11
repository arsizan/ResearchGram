/**
 * Which model to try next, and which ones are currently out of quota.
 *
 * The free tier counts requests per model per day, and the numbers are not
 * close: flash gets 20 a day, flash-lite gets 500. So the right answer to
 * running out is not to stop, it is to move to the next model in the list.
 *
 * Two things make that worth a module rather than a try/catch:
 *
 * 1. A model that just returned 429 will return 429 again. Remembering that for
 *    as long as the API says to means later requests skip it instead of paying a
 *    round trip to be told the same thing.
 * 2. The cooldown has to be shared across requests, not per call, or every user
 *    rediscovers the exhausted model for themselves.
 *
 * In process memory: it empties on cold start and is not shared between
 * serverless instances, the same caveat the rate limiter and the answer cache
 * carry. The cost of being wrong is one wasted request, which is exactly what
 * happened before this existed.
 */

/** model name -> epoch ms when it is worth trying again */
const cooldownUntil = new Map<string, number>();

/** Free tier resets daily, but never wait longer than this before re-testing. */
const MAX_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;

export function parseModelChain(
  value: string | undefined,
  fallback: string,
): string[] {
  const parsed = (value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : [fallback];
}

/**
 * The chain minus whatever is cooling down.
 *
 * If everything is cooling down we return the one that recovers soonest rather
 * than an empty list: a 429 the user can see beats a silent nothing, and the
 * cooldown is a guess, not a guarantee.
 */
export function availableModels(chain: string[]): string[] {
  const now = Date.now();
  const usable = chain.filter((name) => (cooldownUntil.get(name) ?? 0) <= now);

  if (usable.length > 0) return usable;

  const soonest = [...chain].sort(
    (a, b) => (cooldownUntil.get(a) ?? 0) - (cooldownUntil.get(b) ?? 0),
  );

  return soonest.slice(0, 1);
}

export function markRateLimited(model: string, seconds?: number) {
  const waitMs =
    seconds && Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds * 1000, MAX_COOLDOWN_MS)
      : DEFAULT_COOLDOWN_MS;

  cooldownUntil.set(model, Date.now() + waitMs);

  console.warn(
    `GEMINI: ${model} is rate limited — skipping it for ${Math.round(waitMs / 1000)}s`,
  );
}

/**
 * Google puts the wait in prose — "Please retry in 48.820410908s." — and
 * sometimes in a Retry-After header. Take whichever is there.
 */
export function parseRetryAfterSeconds(
  body: string,
  header: string | null,
): number | undefined {
  const fromHeader = Number(header);
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;

  const match = body.match(/retry in ([\d.]+)s/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  return undefined;
}

/** Test seam. Not used by the app. */
export function resetCooldowns() {
  cooldownUntil.clear();
}
