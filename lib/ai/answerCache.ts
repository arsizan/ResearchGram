/**
 * Remembers recent answers so asking the same thing twice costs nothing.
 *
 * This exists because of the free tier: a fixed number of model requests a day,
 * and a demo is mostly the same handful of questions asked over and over. A hit
 * here is a question that does not spend one.
 *
 * In process memory, so it empties on every cold start and is not shared between
 * serverless instances — the same caveat the rate limiter carries. That is fine
 * for what it is: a saving when it works, nothing lost when it does not. A real
 * deployment moves this to Postgres alongside the rate limit.
 *
 * Members are deliberately NOT cached. They depend on who is asking, and serving
 * one user's matches to another would be a privacy bug, not a saving.
 */

import type { AssistantAnswer } from "./types";

export type CachedAnswer = Omit<AssistantAnswer, "members" | "diagnostics">;

type Entry = { value: CachedAnswer; expiresAt: number };

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 40;

const cache = new Map<string, Entry>();

function keyFor(question: string): string {
  return `${process.env.AI_PROVIDER || "gemini"}:${question
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()}`;
}

export function readCachedAnswer(question: string): CachedAnswer | null {
  const key = keyFor(question);
  const hit = cache.get(key);

  if (!hit) return null;

  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  // Refresh recency: Map preserves insertion order, so re-inserting moves this
  // to the end and makes the eviction below a genuine least-recently-used.
  cache.delete(key);
  cache.set(key, hit);

  return hit.value;
}

export function writeCachedAnswer(question: string, value: CachedAnswer) {
  const key = keyFor(question);
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });

  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
