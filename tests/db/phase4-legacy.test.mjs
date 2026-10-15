// Phase 4 on a database that already holds rows older code could write:
// empty messages, notification links to other sites, guessable meeting rooms,
// chat times in the future, and a post that names someone else's paper.
import assert from 'node:assert/strict';
import { makeDb, applyMigration, asUser, uid, MIGRATIONS } from './harness.mjs';

let passed = 0;
const ok = () => { passed += 1; };

const PHASE4 = '20261016000000_phase4.sql';
const AFTER_DEPLOY = '20261016010000_phase4_after_deploy.sql';
const db = await makeDb({ upTo: MIGRATIONS.indexOf(PHASE4) });
const as = asUser(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const [A, B, C] = [uid(1), uid(2), uid(3)];
const [DM, FUTURE, W, MEETING, AP, CP, EMPTY] = [uid(501), uid(502), uid(601), uid(602), uid(701), uid(702), uid(801)];
const paper = `uploads/${A}/${AP}/paper.pdf`;

await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}','a@x.dev','{"full_name":"Alice"}'), ('${B}','b@x.dev','{"full_name":"Bob"}'), ('${C}','c@x.dev','{"full_name":"Carol"}');

  insert into public.conversations (id, participant_one_id, participant_two_id, conversation_type, created_by) values
    ('${DM}','${A}','${B}','direct','${A}'), ('${FUTURE}','${B}','${C}','direct','${B}');
  insert into public.conversation_members (conversation_id, user_id) values
    ('${DM}','${A}'), ('${DM}','${B}'), ('${FUTURE}','${B}'), ('${FUTURE}','${C}');
  -- An empty message (older code allowed it), pinned by C.
  insert into public.messages (id, conversation_id, sender_id, body, pinned_at, pinned_by) values ('${EMPTY}','${DM}','${A}','', now(), '${C}');
  insert into public.messages (conversation_id, sender_id, body) values ('${DM}','${A}','hello');
  -- A chat a browser pushed to the top for good.
  insert into public.messages (conversation_id, sender_id, body, created_at) values ('${FUTURE}','${C}','hi', now() - interval '1 day');
  update public.conversations set last_message_at = '2099-01-01', updated_at = '2099-01-01' where id = '${FUTURE}';

  -- Notifications from before the 12 Oct link rule, sent by C.
  alter table public.notifications drop constraint notifications_link_url_internal;
  insert into public.notifications (recipient_id, actor_id, notification_type, title, link_url) values
    ('${B}','${C}','system','outside link','https://evil.example/x'),
    ('${B}','${C}','system','tab link', '/' || chr(9) || '/evil.example'),
    ('${B}','${C}','system','app link','/feed?post=1');
  alter table public.notifications add constraint notifications_link_url_internal
    check (link_url is null or link_url ~ '^/([^/\\\\]|$)') not valid;

  -- A meeting whose room name follows from the workspace id and the time.
  insert into public.workspaces (id, owner_id, title, workspace_type) values ('${W}','${A}','Old lab','shared');
  insert into public.workspace_meetings (id, workspace_id, created_by, title, room_name, meeting_url) values
    ('${MEETING}','${W}','${A}','Weekly','ResearchGram-${W}-1700000000000','https://meet.jit.si/ResearchGram-${W}-1700000000000');

  -- A's restricted paper, and C's post naming it; C approved B's access request.
  insert into public.contents (id, user_id, title, content, abstract, content_category, full_paper_access_mode) values
    ('${AP}','${A}','A paper','a body','abs','research_paper','request_required'),
    ('${CP}','${C}','C paper','c body','abs','research_paper','request_required');
  insert into storage.objects (bucket_id, name, owner, owner_id) values
    ('restricted-papers','${paper}','${A}','${A}'),
    -- copied between projects by the service role: no owner recorded
    ('content-files','uploads/${C}/${CP}/fig.png',null,null);
  insert into public.content_attachments (content_id, file_url, storage_path, original_name, attachment_type, bucket_name, access_level) values
    ('${AP}','','${paper}','paper.pdf','document','restricted-papers','restricted'),
    ('${CP}','','${paper}','paper.pdf','document','restricted-papers','restricted'),
    ('${CP}','https://x.dev/fig.png','uploads/${C}/${CP}/fig.png','fig.png','image','content-files','public');
  insert into public.paper_access_requests (content_id, requester_id, owner_id, status) values ('${CP}','${B}','${C}','approved');`);

const canRead = async (who, name) =>
  (await as(who, `select 1 from storage.objects where bucket_id = 'restricted-papers' and name = $1`, [name])).length === 1;
assert.equal(await canRead(B, paper), true, 'the hole Phase 4 closes is really there before it'); ok();

await applyMigration(db, PHASE4);
const room = (await one(`select room_name, meeting_url from public.workspace_meetings where id = '${MEETING}'`));
await applyMigration(db, AFTER_DEPLOY);
await applyMigration(db, PHASE4);
await applyMigration(db, AFTER_DEPLOY);
console.log('MIGRATIONS: Phase 4 and the after-deploy file run (twice) over older rows'); ok();

// Old empty messages no longer break marking a chat as read.
const marked = await as(B, `update public.messages set read_at = now() where conversation_id = '${DM}' and sender_id <> '${B}' and read_at is null returning id`);
assert.equal(marked.length, 2); ok();
await as(B, `update public.conversation_members set last_read_at = now() where conversation_id = '${DM}' and user_id = '${B}'`); ok();
assert.equal(Number((await one(`select count(*) n from pg_constraint where conname = 'messages_not_empty'`)).n), 0); ok();
console.log('MESSAGES: older empty messages can still be marked as read');

// Links to other sites are dropped; the rule now covers every row.
const links = await q(`select title, link_url from public.notifications order by title`);
assert.deepEqual(links.map((n) => [n.title, n.link_url]), [['app link', '/feed?post=1'], ['outside link', null], ['tab link', null]]); ok();
assert.equal((await one(`select convalidated from pg_constraint where conname = 'notifications_link_url_internal'`)).convalidated, true); ok();
const tryLink = (link) => as(B, `insert into public.notifications (recipient_id, actor_id, notification_type, title, link_url) values ('${A}','${B}','system','x',$1)`, [link]);
for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/feed post', 'https://evil.example']) {
  await assert.rejects(tryLink(bad), /notifications_link_url_internal/, JSON.stringify(bad)); ok();
}
for (const good of ['/', '/requests', '/feed?post=00000000-0000-4000-8000-000000000001', '/messages?conversation=abc#end']) {
  await tryLink(good); ok();
}
console.log('NOTIFICATIONS: outside links removed, the link rule is now checked for all rows');

// Old meetings get random rooms, once.
assert.match(room.room_name, /^ResearchGram-[0-9a-f]{32}$/); assert.equal(room.meeting_url, `https://meet.jit.si/${room.room_name}`); ok();
assert.deepEqual(await one(`select room_name, meeting_url from public.workspace_meetings where id = '${MEETING}'`), room, 'running again keeps it'); ok();
console.log('MEETINGS: guessable rooms replaced once');

// A chat time in the future is set back to its latest message.
const future = await one(`select last_message_at, updated_at from public.conversations where id = '${FUTURE}'`);
const latest = await one(`select max(created_at) t from public.messages where conversation_id = '${FUTURE}'`);
assert.equal(new Date(future.last_message_at).getTime(), new Date(latest.t).getTime()); ok();
assert.ok(new Date(future.updated_at) <= new Date()); ok();
console.log('CHATS: no chat stays on top with a time in the future');

// The paper: only its author and readers approved for the author's own post.
assert.equal(await canRead(B, paper), false, 'approval on C\'s post no longer opens A\'s paper'); ok();
assert.equal(await canRead(A, paper), true); ok();

// Removing C's post deletes C's files only (also files copied without an owner).
await db.exec(`insert into public.admins (user_id) values ('${A}')`);
const removed = (await as(A, `select public.admin_remove_post('${CP}', 'Copied paper') r`))[0].r;
assert.deepEqual(removed.files, [{ bucket: 'content-files', path: `uploads/${C}/${CP}/fig.png` }]); ok();
console.log('POST FILES: a post that names someone else\'s paper opens nothing and deletes nothing of theirs');

// C can delete the account: C sent notifications and pinned an old empty message.
await as(A, `delete from storage.objects where bucket_id = 'content-files' and name = 'uploads/${C}/${CP}/fig.png'`);
assert.equal((await as(C, `select * from public.my_storage_objects()`)).length, 0); ok();
await as(C, `select public.delete_my_account('DELETE')`); ok();
assert.equal((await one(`select pinned_by from public.messages where id = '${EMPTY}'`)).pinned_by, null, 'the pin is cleared, the message stays'); ok();
assert.equal(Number((await one(`select count(*) n from public.notifications where actor_id is null`)).n), 3); ok();
assert.equal(await canRead(A, paper), true, 'A\'s paper is untouched'); ok();
console.log('DELETE ACCOUNT: works with older rows that pointed at the account');

console.log(`\nALL PHASE 4 LEGACY CHECKS PASSED: ${passed}`);
