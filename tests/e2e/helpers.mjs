import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test as base, expect } from '@playwright/test';
import { installFakeSupabase, makeDb, sessionCookie, sessionFor } from './fake-supabase.mjs';

export { expect };

/**
 * `db` is a fresh fake database per test; `app` is the page with the fake
 * Supabase installed. Tests that need a signed-in person call signIn().
 */
export const test = base.extend({
  // (Playwright calls the second argument `use`; named `provide` here so the
  // React hooks lint rule does not mistake it for a hook.)
  db: async ({ browserName }, provide) => {
    void browserName;
    await provide(makeDb());
  },
  app: async ({ page, db }, provide) => {
    await installFakeSupabase(page, db);
    await provide(page);
  },
});

export async function signIn(context, db, userId = db.U) {
  const email = db.tables.profiles.find((p) => p.id === userId)?.email || 'me@test.dev';
  await context.addCookies([sessionCookie(sessionFor(userId, email))]);
}

/** Calls of one database function the page made. */
export const rpcCalls = (db, fn) => db.rpcCalls.filter((call) => call.fn === fn);

/** Waits until the page has called a database function (at least `count` times). */
export async function waitForRpc(db, fn, count = 1) {
  await expect.poll(() => rpcCalls(db, fn).length, { message: `${fn} was called` }).toBeGreaterThanOrEqual(count);
  return rpcCalls(db, fn);
}

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** WCAG 2.1 A/AA problems on the page as it is now (same rules as Phase 3). */
export async function accessibilityProblems(page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  });
}
