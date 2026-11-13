// 13 Nov 2026: browser tests for pages whose data cannot be loaded (the
// database or the connection is down). They must say so, with "Try again",
// instead of looking empty, and the feed must not send people to the profile
// setup form (saving it could overwrite their profile). Testing report D-02.
import { accessibilityProblems, expect, signIn, test } from './helpers.mjs';
import { SUPABASE_URL } from './fake-supabase.mjs';

// Every database request fails as if the server could not be reached;
// signing in still works (that is a different server path).
const escapedUrl = SUPABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DATABASE = new RegExp(`^${escapedUrl}/rest/v1/`);
const databaseDown = (app) => app.route(DATABASE, (route) => route.abort('connectionrefused'));
const databaseBack = (app) => app.unroute(DATABASE);

test.beforeEach(async ({ context, db }) => {
  await signIn(context, db);
});

const message = (app) => app.getByRole('alert').filter({ hasText: 'This page could not be loaded' });

test('the feed says it could not be loaded, and does not open the profile setup form', async ({ app }) => {
  await databaseDown(app);
  await app.goto('/feed');
  await expect(message(app)).toBeVisible();
  await expect(app).toHaveURL(/\/feed$/);
  await expect(app.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(await accessibilityProblems(app)).toEqual([]);

  // Back online: "Try again" shows the feed.
  await databaseBack(app);
  await app.getByRole('button', { name: 'Try again' }).click();
  await expect(app.getByText('Post number 1', { exact: true }).first()).toBeVisible();
  await expect(message(app)).toHaveCount(0);
});

test('the profile setup form is not shown empty when the saved profile cannot be read', async ({ app, db }) => {
  await databaseDown(app);
  await app.goto('/onboarding');
  await expect(message(app)).toBeVisible();
  await expect(app.getByRole('button', { name: 'Save and Continue' })).toHaveCount(0);
  expect(db.writes.filter((w) => w.table === 'profiles')).toHaveLength(0);
});

test('notifications say they could not be loaded instead of "No notifications"', async ({ app }) => {
  await databaseDown(app);
  await app.goto('/notifications');
  await expect(message(app)).toBeVisible();
  await expect(app.getByText('No notifications')).toHaveCount(0);

  await databaseBack(app);
  await app.getByRole('button', { name: 'Try again' }).click();
  await expect(app.getByText('Notification 1', { exact: true })).toBeVisible();
});

test('the network page says it could not be loaded instead of "Your network is empty"', async ({ app }) => {
  await databaseDown(app);
  await app.goto('/network');
  await expect(message(app)).toBeVisible();
  await expect(app.getByText('Your network is empty')).toHaveCount(0);
});
