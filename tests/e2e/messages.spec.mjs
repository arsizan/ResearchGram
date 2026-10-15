import { uid } from './fake-supabase.mjs';
import { expect, rpcCalls, signIn, test, waitForRpc } from './helpers.mjs';

const CHAT_1 = uid(501);

async function openChat(app, name) {
  await app.goto('/messages');
  await app.getByRole('button', { name: new RegExp(`${name}\\b`) }).first().click();
  await expect(app.getByLabel('Message', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ context, db }) => {
  await signIn(context, db);
});

test('sending text saves one message; the database moves the chat to the top (RG-20)', async ({ app, db }) => {
  await openChat(app, 'Researcher 2');
  await app.getByLabel('Message', { exact: true }).fill('Hello from the test');
  await app.getByRole('button', { name: 'Send message' }).click();

  await expect(app.getByText('Hello from the test')).toBeVisible();
  const saved = db.tables.messages.find((m) => m.body === 'Hello from the test');
  expect(saved).toMatchObject({ conversation_id: CHAT_1, sender_id: db.U });
  expect(saved.attachment_path ?? null).toBeNull();
  // The browser no longer updates conversations itself.
  expect(db.writes.filter((w) => w.kind === 'update' && w.table === 'conversations')).toHaveLength(0);
});

test('a file is uploaded to the chat folder and sent with the message', async ({ app, db }) => {
  await openChat(app, 'Researcher 2');
  await app.locator('input[type="file"]').setInputFiles({ name: 'results.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  await expect(app.getByText('results.csv', { exact: true })).toBeVisible();
  await expect(app.getByRole('status').filter({ hasText: 'Attached results.csv, 8 B' })).toHaveCount(1);
  await app.getByRole('button', { name: 'Send message' }).click();

  await expect.poll(() => db.tables.messages.find((m) => m.attachment_name === 'results.csv')).toBeTruthy();
  const message = db.tables.messages.find((m) => m.attachment_name === 'results.csv');
  expect(message.attachment_path).toMatch(new RegExp(`^${CHAT_1}/${db.U}/\\d+-results\\.csv$`));
  expect(message).toMatchObject({ attachment_kind: 'file', attachment_type: 'text/csv', attachment_size: 8, body: null });
  expect(db.storage.some((o) => o.bucket === 'chat-attachments' && o.path === message.attachment_path)).toBe(true);
  // Shown in the chat as a link to a signed address.
  await expect(app.getByRole('link', { name: /results\.csv/ })).toHaveAttribute('href', /\/object\/sign\/chat-attachments\//);
});

test('a file that is too big is refused before uploading', async ({ app, db }) => {
  await openChat(app, 'Researcher 2');
  await app.locator('input[type="file"]').setInputFiles({ name: 'huge.zip', mimeType: 'application/zip', buffer: Buffer.alloc(26 * 1024 * 1024) });
  await expect(app.getByRole('alert').filter({ hasText: 'larger than 25 MB' })).toBeVisible();
  expect(db.storage).toHaveLength(0);
});

test('a voice message is recorded, can be listened to, and is sent', async ({ app, db }) => {
  await openChat(app, 'Researcher 2');
  await app.getByRole('button', { name: 'Record a voice message' }).click();
  // Announced once (not every second); keyboard focus moves to Stop.
  await expect(app.getByRole('status').filter({ hasText: 'Recording a voice message' })).toHaveCount(1);
  await expect(app.getByRole('timer')).toContainText('Recording 0:');
  await expect(app.getByRole('button', { name: 'Stop recording' })).toBeFocused();
  await app.waitForTimeout(1500);
  await app.keyboard.press('Enter');

  await expect(app.getByLabel(/Recorded voice message/)).toBeVisible();
  await expect(app.getByRole('status').filter({ hasText: 'Voice message ready to send.' })).toHaveCount(1);
  await expect(app.getByRole('button', { name: 'Send message' })).toBeFocused();
  await app.getByRole('button', { name: 'Send message' }).click();

  await expect.poll(() => db.tables.messages.find((m) => m.attachment_kind === 'voice')).toBeTruthy();
  const voice = db.tables.messages.find((m) => m.attachment_kind === 'voice');
  expect(voice.attachment_path).toMatch(new RegExp(`^${CHAT_1}/${db.U}/\\d+-voice\\.(webm|ogg|m4a)$`));
  expect(voice.attachment_type).toMatch(/^audio\//);
  expect(voice.attachment_duration_seconds).toBeGreaterThanOrEqual(1);
  await expect(app.getByLabel(/^Voice message, \d+:\d\d$/)).toBeVisible();
});

// The browser's permission question takes a while; every microphone stream
// handed out is remembered so the test can check that it was given back.
async function slowMicrophone(app) {
  await app.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__micCalls = 0;
    window.__micTracks = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__micCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
      const stream = await original(constraints);
      window.__micTracks.push(...stream.getTracks());
      return stream;
    };
  });
}
const micState = (app) => app.evaluate(() => ({
  calls: window.__micCalls,
  tracks: window.__micTracks.length,
  allStopped: window.__micTracks.every((track) => track.readyState === 'ended'),
}));

test('switching chats while the browser asks for the microphone does not leave it on', async ({ app }) => {
  await slowMicrophone(app);
  await openChat(app, 'Researcher 2');
  await app.getByRole('button', { name: 'Record a voice message' }).click();
  await app.getByRole('button', { name: /Researcher 3\b/ }).first().click();

  await expect.poll(async () => (await micState(app)).tracks).toBeGreaterThan(0);
  await expect.poll(async () => (await micState(app)).allStopped).toBe(true);
  await expect(app.getByRole('timer')).toHaveCount(0);
});

test('a double click on the microphone asks for it once', async ({ app }) => {
  await slowMicrophone(app);
  await openChat(app, 'Researcher 2');
  await app.getByRole('button', { name: 'Record a voice message' }).dblclick();
  await expect(app.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  expect((await micState(app)).calls).toBe(1);

  await app.getByRole('button', { name: 'Cancel recording' }).click();
  await expect.poll(async () => (await micState(app)).allStopped).toBe(true);
  await expect(app.getByLabel('Message', { exact: true })).toBeFocused();
});

test('a chosen file stays with its chat', async ({ app }) => {
  await openChat(app, 'Researcher 2');
  await app.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(app.getByRole('button', { name: 'Remove attachment' })).toBeVisible();
  await app.getByRole('button', { name: /Researcher 3\b/ }).first().click();
  await expect(app.getByRole('button', { name: 'Remove attachment' })).toHaveCount(0);

  // Removing a file returns the keyboard to the message box.
  await app.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await app.getByRole('button', { name: 'Remove attachment' }).click();
  await expect(app.getByLabel('Message', { exact: true })).toBeFocused();
});

test('muting a chat keeps its unread messages out of the badge', async ({ app, db }) => {
  const CHAT_2 = uid(502);
  const CHAT_3 = uid(503);
  const nav = app.getByRole('navigation', { name: 'Main' });
  const membership = (chat) => db.tables.conversation_members.find((m) => m.conversation_id === chat && m.user_id === db.U);

  await app.goto('/messages');
  await app.getByRole('button', { name: /Researcher 3\b/ }).first().click();
  await app.getByRole('button', { name: 'More options' }).click();
  await app.getByRole('menuitem', { name: 'Mute chat' }).click();
  await expect.poll(() => membership(CHAT_2).muted).toBe(true);
  await expect(app.getByRole('button', { name: /Researcher 3 \(muted\)/ })).toBeVisible();

  // Leave the muted chat open in the background, then new messages arrive.
  await app.getByRole('button', { name: /Researcher 2\b/ }).first().click();
  const now = Date.now();
  for (const [chat, sender] of [[CHAT_2, uid(3)], [CHAT_3, uid(4)]]) {
    db.tables.messages.push({ id: uid(4000 + db.tables.messages.length), conversation_id: chat, sender_id: sender, body: 'New!', message_text: null, read_at: null, is_deleted: false, created_at: new Date(now + 60_000).toISOString() });
  }
  await app.evaluate(() => window.dispatchEvent(new Event('researchgram:refresh-nav-counts')));

  // Only the chat that is not muted counts.
  await expect(nav.getByRole('link', { name: /^Messages\s*, 1 unread$/ })).toBeVisible();

  // Unmuting from the menu.
  await app.getByRole('button', { name: /Researcher 3\b/ }).first().click();
  await app.getByRole('button', { name: 'More options' }).click();
  await app.getByRole('menuitem', { name: 'Unmute chat' }).click();
  await expect.poll(() => membership(CHAT_2).muted).toBe(false);
});

test('the options menu works with the keyboard', async ({ app }) => {
  await openChat(app, 'Researcher 2');
  const button = app.getByRole('button', { name: 'More options' });
  await button.focus();
  await app.keyboard.press('Enter');
  await expect(app.getByRole('menuitem', { name: 'Mute chat' })).toBeFocused();
  await app.keyboard.press('ArrowDown');
  await expect(app.getByRole('menuitem', { name: 'View profile' })).toBeFocused();
  await app.keyboard.press('Escape');
  await expect(app.getByRole('menu')).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('a new direct chat is opened by one database call (RG-20)', async ({ app, db }) => {
  db.tables.user_connections.push({ id: uid(701), user_one_id: db.U, user_two_id: uid(6), created_at: new Date().toISOString() });
  await app.goto('/messages');
  await app.getByRole('button', { name: 'New Chat' }).click();
  await app.getByLabel('Researcher to message').selectOption({ label: 'Researcher 6 · CSE' });
  await app.getByRole('button', { name: 'Open Direct Chat' }).click();

  const calls = await waitForRpc(db, 'start_direct_conversation');
  expect(calls[0].args).toEqual({ p_other_user: uid(6) });
  expect(db.writes.filter((w) => w.kind === 'insert' && ['conversations', 'conversation_members'].includes(w.table))).toHaveLength(0);
  await expect(app.getByLabel('Message', { exact: true })).toBeVisible();
  expect(rpcCalls(db, 'start_direct_conversation')).toHaveLength(1);
});
