import { uid } from './fake-supabase.mjs';
import { accessibilityProblems, expect, signIn, test } from './helpers.mjs';

// The pages and states Phase 4 added, checked against WCAG 2.1 A/AA.

test('admin console', async ({ app, context, db }) => {
  db.admins.add(db.U);
  db.tables.post_reports.push({ id: uid(4700), content_id: uid(2001), reporter_id: uid(3), reason: 'spam', details: 'Looks like an ad', status: 'pending', created_at: new Date().toISOString() });
  await signIn(context, db);
  await app.goto('/admin');
  await expect(app.getByRole('heading', { name: 'Reported posts' })).toBeVisible();
  expect(await accessibilityProblems(app)).toEqual([]);
});

test('profile with the delete-account panel open', async ({ app, context, db }) => {
  await signIn(context, db);
  await app.goto('/profile');
  await app.getByRole('button', { name: 'Delete my account…' }).click();
  await expect(app.getByLabel('Type DELETE to confirm')).toBeVisible();
  expect(await accessibilityProblems(app)).toEqual([]);
});

test('message box with an attachment and the options menu', async ({ app, context, db }) => {
  await signIn(context, db);
  await app.goto('/messages');
  await app.getByRole('button', { name: /Researcher 2\b/ }).first().click();
  await app.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await app.getByRole('button', { name: 'More options' }).click();
  await expect(app.getByRole('menu')).toBeVisible();
  expect(await accessibilityProblems(app)).toEqual([]);
});

test('ORCID return page with an error', async ({ app, context, db }) => {
  await signIn(context, db);
  await app.goto('/profile/orcid?error=access_denied');
  await expect(app.getByRole('alert').filter({ hasText: 'cancelled' })).toBeVisible();
  expect(await accessibilityProblems(app)).toEqual([]);
});
