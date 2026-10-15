import { uid } from './fake-supabase.mjs';
import { expect, rpcCalls, signIn, test, waitForRpc } from './helpers.mjs';

const REPORTED = uid(2002);

function addReports(db) {
  const now = new Date().toISOString();
  db.tables.content_attachments.push({ id: uid(4500), content_id: REPORTED, file_url: '', storage_path: `uploads/${uid(2)}/${REPORTED}/a.pdf`, bucket_name: 'content-files', original_name: 'a.pdf', attachment_type: 'document', created_at: now });
  db.storage.push({ bucket: 'content-files', path: `uploads/${uid(2)}/${REPORTED}/a.pdf`, owner: uid(2), size: 100 });
  db.tables.post_reports.push(
    { id: uid(4600), content_id: REPORTED, reporter_id: uid(3), reason: 'spam', details: 'Advertising', status: 'pending', created_at: now },
    { id: uid(4601), content_id: REPORTED, reporter_id: uid(4), reason: 'misleading', details: null, status: 'pending', created_at: now },
  );
}

test('people who are not admins see no admin data', async ({ app, context, db }) => {
  await signIn(context, db);
  await app.goto('/admin');
  await expect(app.getByRole('heading', { name: 'Admins only' })).toBeVisible();
  expect(rpcCalls(db, 'admin_report_queue')).toHaveLength(0);
});

test('an admin removes a reported post; its files are deleted and the action is logged', async ({ app, context, db }) => {
  db.admins.add(db.U);
  addReports(db);
  await signIn(context, db);
  await app.goto('/admin');

  await expect(app.getByRole('heading', { name: 'Admin console' })).toBeVisible();
  const item = app.getByRole('listitem').filter({ hasText: 'Post number 2' });
  await expect(item.getByText('2 reports')).toBeVisible();
  await expect(item.getByText('spam, misleading')).toBeVisible();

  // A reason is required.
  await item.getByRole('button', { name: 'Remove post' }).click();
  await expect(app.getByRole('status').filter({ hasText: 'Write the reason first' })).toBeVisible();

  await item.getByLabel(/Reason or note/).fill('Advertising is not allowed.');
  await item.getByRole('button', { name: 'Remove post' }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Remove post' }).click();

  const [call] = await waitForRpc(db, 'admin_remove_post');
  expect(call.args).toEqual({ p_content_id: REPORTED, p_reason: 'Advertising is not allowed.' });
  await expect.poll(() => db.writes.find((w) => w.kind === 'remove')).toMatchObject({ bucket: 'content-files', paths: [`uploads/${uid(2)}/${REPORTED}/a.pdf`] });
  await expect(app.getByText('No open reports. Nice.')).toBeVisible();
  await expect(app.getByText('Post removed', { exact: true })).toBeVisible();
});

test('an admin can dismiss reports and keep the post', async ({ app, context, db }) => {
  db.admins.add(db.U);
  addReports(db);
  await signIn(context, db);
  await app.goto('/admin');
  await app.getByRole('button', { name: 'Dismiss reports' }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Dismiss reports' }).click();
  await waitForRpc(db, 'admin_dismiss_reports');
  expect(db.tables.contents.some((c) => c.id === REPORTED)).toBe(true);
  await app.getByRole('button', { name: 'Closed' }).click();
  await expect(app.getByRole('listitem').filter({ hasText: 'Post number 2' })).toBeVisible();
});
