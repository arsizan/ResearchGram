import { uid } from './fake-supabase.mjs';
import { expect, signIn, test, waitForRpc } from './helpers.mjs';

test('accepting a collaboration request is one database call that also opens the chat (RG-20)', async ({ app, context, db }) => {
  await signIn(context, db);
  await app.goto('/requests');
  await app.getByRole('button', { name: 'Accept', exact: true }).click();

  const [call] = await waitForRpc(db, 'respond_to_research_request');
  expect(call.args).toEqual({ p_request_id: uid(710), p_status: 'accepted' });
  expect(db.tables.research_requests[0].status).toBe('accepted');
  expect(db.tables.conversations.some((c) => c.request_id === uid(710))).toBe(true);
  // The notice to the sender is written by the database, not the browser.
  expect(db.writes.filter((w) => w.kind === 'insert' && w.table === 'notifications')).toHaveLength(0);
  await expect(app.getByRole('button', { name: 'Open Messages' }).first()).toBeVisible();
});
