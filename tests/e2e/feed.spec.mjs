import { expect, signIn, test, waitForRpc } from './helpers.mjs';

test.beforeEach(async ({ context, db }) => {
  await signIn(context, db);
});

async function fillPost(app) {
  await app.goto('/feed');
  await app.getByRole('button', { name: 'Create new post' }).click();
  await app.getByLabel('Title', { exact: true }).fill('My new finding');
  await app.getByLabel('Post text', { exact: true }).fill('Details of the finding.');
  await app.getByLabel('Attach files').setInputFiles({ name: 'figure.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
}

test('a post, its co-authors and files are saved in one call after the upload (RG-20)', async ({ app, db }) => {
  await fillPost(app);
  await app.getByRole('button', { name: 'Publish Post' }).click();

  const [call] = await waitForRpc(db, 'create_post');
  const { p_id: postId, p_attachments: files } = call.args;
  expect(postId).toMatch(/^[0-9a-f-]{36}$/);
  expect(files).toHaveLength(1);
  expect(files[0].storage_path).toMatch(new RegExp(`^uploads/${db.U}/${postId}/`));
  expect(files[0]).toMatchObject({ bucket_name: 'content-files', file_role: 'attachment', original_name: 'figure.png' });
  expect(db.writes.filter((w) => w.kind === 'insert' && ['contents', 'content_attachments', 'content_authors'].includes(w.table))).toHaveLength(0);
  await expect(app.getByText('My new finding').first()).toBeVisible();
});

test('when the post cannot be saved, its uploaded files are deleted again', async ({ app, db }) => {
  db.failNextCreatePost = true;
  await fillPost(app);
  await app.getByRole('button', { name: 'Publish Post' }).click();

  await expect(app.getByRole('alert').filter({ hasText: 'the post could not be saved' })).toBeVisible();
  const upload = db.writes.find((w) => w.kind === 'upload');
  const removal = db.writes.find((w) => w.kind === 'remove');
  expect(removal).toMatchObject({ bucket: 'content-files', paths: [upload.path] });
  expect(db.storage).toHaveLength(0);
});
