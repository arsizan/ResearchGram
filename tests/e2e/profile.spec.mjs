import { expect, rpcCalls, signIn, test, waitForRpc } from './helpers.mjs';

test.beforeEach(async ({ context, db }) => {
  await signIn(context, db);
});

test('the default cover picture is served by the app itself', async ({ app }) => {
  await app.goto('/profile');
  await expect(app.locator('img[src="/images/default-cover.svg"]')).toHaveCount(1);
});

test('ORCID sign-in: the database confirms the code, the profile shows the iD as verified', async ({ app, db }) => {
  db.tables.profiles[0].orcid_id = '0000-0002-1825-0097';
  await app.route('https://sandbox.orcid.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ORCID</title>' }));

  await app.goto('/profile');
  await app.getByRole('button', { name: 'Verify with ORCID' }).click();
  await expect(app).toHaveURL(/^https:\/\/sandbox\.orcid\.org\/oauth\/authorize\?/);
  const authorize = new URL(app.url());
  expect(authorize.searchParams.get('client_id')).toBe('APP-E2E-TEST');
  expect(authorize.searchParams.get('scope')).toBe('/authenticate');
  expect(authorize.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3100/profile/orcid');
  const state = authorize.searchParams.get('state');
  expect(state).toMatch(/^[0-9a-f-]{36}$/);

  // ORCID sends the person back with a one-time code.
  await app.goto(`/profile/orcid?code=one-time-code&state=${state}`);
  const [call] = await waitForRpc(db, 'verify_orcid');
  expect(call.args).toEqual({ p_code: 'one-time-code', p_redirect_uri: 'http://127.0.0.1:3100/profile/orcid' });
  await expect(app).toHaveURL(/\/profile$/);
  await expect(app.getByText('Verified', { exact: true })).toBeVisible();
});

test('ORCID sign-in that ORCID does not confirm shows why, and the iD stays unverified', async ({ app, db }) => {
  await app.route('https://sandbox.orcid.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ORCID</title>' }));
  await app.goto('/profile');
  await app.getByRole('button', { name: 'Verify with ORCID' }).click();
  await expect(app).toHaveURL(/^https:\/\/sandbox\.orcid\.org\/oauth\/authorize\?/);
  const state = new URL(app.url()).searchParams.get('state');

  await app.goto(`/profile/orcid?code=used-code&state=${state}`);
  await expect(app.getByRole('alert').filter({ hasText: 'did not confirm' })).toBeVisible();
  expect(rpcCalls(db, 'verify_orcid')).toHaveLength(1);
  expect(db.tables.profiles[0].orcid_verified_at ?? null).toBeNull();
});

test('an ORCID return that this tab did not start is refused', async ({ app, db }) => {
  await app.goto('/profile/orcid?code=stolen&state=not-mine');
  await expect(app.getByRole('alert').filter({ hasText: 'not valid here' })).toBeVisible();
  expect(rpcCalls(db, 'verify_orcid')).toHaveLength(0);
  expect(new URL(app.url()).search).toBe('');
});

test('"Download my data" saves everything as one JSON file', async ({ app, db }) => {
  await app.goto('/profile');
  const download = app.waitForEvent('download');
  await app.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^researchgram-data-\d{4}-\d{2}-\d{2}\.json$/);
  expect(rpcCalls(db, 'export_my_data')).toHaveLength(1);
});

test('deleting the account removes the files first, then the account, then signs out', async ({ app, db }) => {
  db.storage.push({ bucket: 'profile-avatars', path: `${db.U}/profile-1.png`, owner: db.U, size: 10 });
  await app.goto('/profile');
  await app.getByRole('button', { name: 'Delete my account…' }).click();
  const deleteButton = app.getByRole('button', { name: 'Delete my account permanently' });
  await expect(deleteButton).toBeDisabled();
  await app.getByLabel('Type DELETE to confirm').fill('DELETE');
  await deleteButton.click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Delete my account' }).click();

  await waitForRpc(db, 'delete_my_account');
  const order = db.rpcCalls.map((c) => c.fn).filter((fn) => ['my_storage_objects', 'delete_my_account'].includes(fn));
  expect(order).toEqual(['my_storage_objects', 'delete_my_account']);
  expect(db.writes.find((w) => w.kind === 'remove')).toMatchObject({ bucket: 'profile-avatars', paths: [`${db.U}/profile-1.png`] });
  expect(rpcCalls(db, 'delete_my_account')[0].args).toEqual({ p_confirm: 'DELETE' });
  await expect(app).toHaveURL(/127\.0\.0\.1:3100\/$/);
});
