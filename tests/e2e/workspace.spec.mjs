import { uid } from './fake-supabase.mjs';
import { expect, signIn, test, waitForRpc } from './helpers.mjs';

test.beforeEach(async ({ context, db }) => {
  await signIn(context, db);
});

test('a shared workspace is created by one database call and opened (RG-20)', async ({ app, db }) => {
  await app.goto('/workspace');
  await app.getByRole('button', { name: 'Shared Workspace' }).click();
  await app.getByLabel('Project title').fill('Graph lab');
  await app.getByRole('button', { name: 'Create Shared Workspace' }).click();

  const [call] = await waitForRpc(db, 'create_workspace');
  expect(call.args).toMatchObject({ p_title: 'Graph lab', p_workspace_type: 'shared' });
  // No separate inserts from the browser: the database did all steps.
  expect(db.writes.filter((w) => w.kind === 'insert' && ['workspaces', 'workspace_members', 'conversations', 'conversation_members'].includes(w.table))).toHaveLength(0);
  await expect(app.getByRole('heading', { name: 'Graph lab' }).first()).toBeVisible();
  expect(db.tables.conversations.some((c) => c.workspace_id === db.tables.workspaces[0].id)).toBe(true);
});

test('adding a task updates the list without reloading the workspace (RG-31)', async ({ app, db }) => {
  const W = uid(600);
  db.tables.workspaces.push({ id: W, owner_id: db.U, title: 'Thesis', description: null, research_area: null, status: 'active', due_date: null, workspace_type: 'personal', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  db.tables.workspace_members.push({ id: uid(601), workspace_id: W, user_id: db.U, role: 'owner', created_at: new Date().toISOString() });

  const reads = [];
  app.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.startsWith('/rest/v1/workspace_')) reads.push(url.pathname);
  });

  await app.goto('/workspace');
  await app.getByRole('button', { name: /Tasks/ }).first().click();
  await expect(app.getByLabel('Task title')).toBeVisible();
  reads.length = 0;

  await app.getByLabel('Task title').fill('Write chapter 2');
  await app.getByRole('button', { name: 'Add Task' }).click();
  await expect(app.getByText('Write chapter 2')).toBeVisible();
  // Before Phase 4 this reloaded 11 lists; now nothing is read again.
  expect(reads).toEqual([]);
});

test('meeting rooms get a random name from the database (RG-22)', async ({ app, db }) => {
  const W = uid(610);
  db.tables.workspaces.push({ id: W, owner_id: db.U, title: 'Lab', description: null, research_area: null, status: 'active', due_date: null, workspace_type: 'shared', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

  await app.goto('/workspace');
  await app.getByRole('button', { name: /Meetings/ }).first().click();
  await app.getByLabel('Meeting title').fill('Weekly sync');
  await app.getByRole('button', { name: 'Create Video Room' }).click();

  const frame = app.locator('iframe[title="Weekly sync"]');
  await expect(frame).toHaveAttribute('src', /^https:\/\/meet\.jit\.si\/ResearchGram-[0-9a-f]{32}$/);
  const sent = db.writes.find((w) => w.kind === 'insert' && w.table === 'workspace_meetings');
  expect(sent.rows[0].room_name).not.toContain(W.replace(/-/g, ''));
});
