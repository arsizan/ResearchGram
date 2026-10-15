// Phase 4 migration test: admins + audit log, moderation, all-or-nothing
// writes (RG-20), connections rule, chat attachments, Jitsi rooms (RG-22),
// ORCID verification, data export, account deletion, grants.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb, asUser, uid, MIGRATIONS } from './harness.mjs';

let passed = 0;
const ok = () => { passed += 1; };
const check = async (label, fn) => {
  try { await fn(); } catch (e) { console.error(`FAILED: ${label}`); throw e; }
};

const db = await makeDb({ rerun: ['20261016000000_phase4.sql', '20261016010000_phase4_after_deploy.sql'] });
assert.equal(MIGRATIONS.length, 9);
console.log('MIGRATIONS: applied, Phase 4 re-run OK'); ok();

// The chat bucket accepts exactly what the app lets people attach.
{
  const source = readFileSync(new URL('../../lib/uploadRules.ts', import.meta.url), 'utf8');
  const list = (name) => {
    const body = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`))[1];
    return body.split(',').map((item) => item.trim()).filter(Boolean).flatMap((item) =>
      item.startsWith('...') ? list(item.slice(3)) : [item.replace(/^"|"$/g, '')]);
  };
  const expected = [...list('FILE_TYPES'), ...list('AUDIO_TYPES')].sort();
  const bucket = (await db.query(`select allowed_mime_types, file_size_limit, public from storage.buckets where id = 'chat-attachments'`)).rows[0];
  assert.deepEqual([...bucket.allowed_mime_types].sort(), expected); ok();
  assert.equal(Number(bucket.file_size_limit), 25 * 1024 * 1024); assert.equal(bucket.public, false); ok();
  assert.match(source, /MAX_CHAT_FILE_BYTES = 25 \* 1024 \* 1024/); ok();
}

const as = asUser(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const [A, B, C, D] = [uid(1), uid(2), uid(3), uid(4)];
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}','a@x.dev','{"full_name":"Alice Admin","department":"CSE"}'),
  ('${B}','b@x.dev','{"full_name":"Bob Member","department":"CSE"}'),
  ('${C}','c@x.dev','{"full_name":"Carol Other","department":"EEE"}'),
  ('${D}','d@x.dev','{"full_name":"Dan Stranger","department":"EEE"}');`);
// A and B are connected; C and D are not connected to anyone yet.
await db.exec(`insert into public.user_connections (user_one_id, user_two_id) values ('${A}','${B}')`);

const auditCount = async (action) => Number((await one(`select count(*) n from public.audit_log where action = $1`, [action])).n);

// ---------------------------------------------------------------- 1. grants
await check('grants', async () => {
  for (const fn of ['admin_overview()', 'export_my_data()', 'my_storage_objects()', `delete_my_account('DELETE')`,
    `create_workspace('x')`, `start_direct_conversation('${B}')`, `verify_orcid('c','https://x.dev/')`]) {
    await assert.rejects(as(null, `select public.${fn}`), /permission denied/, `anon cannot call ${fn}`); ok();
  }
  for (const fn of [`write_audit('x','y','z','{}')`, `take_rate_limit('x', interval '1 second')`, `orcid_setting('orcid_client_id')`, 'require_admin()']) {
    await assert.rejects(as(B, `select public.${fn}`), /permission denied/, `authenticated cannot call ${fn}`); ok();
  }
  for (const t of ['admins', 'audit_log', 'action_rate_limits']) {
    await assert.rejects(as(B, `select * from public.${t}`), /permission denied/, `no direct read of ${t}`); ok();
  }
});
console.log('GRANTS: anon has none of the new functions; internal helpers and tables are closed');

// ---------------------------------------------------------------- 2. admins
await check('admins', async () => {
  await assert.rejects(as(A, `select public.admin_overview()`), /Only admins/); ok();
  assert.equal((await as(A, `select public.is_admin() v`))[0].v, false); ok();
  await db.exec(`insert into public.admins (user_id) values ('${A}')`);
  assert.equal(await auditCount('admin.added'), 1); ok();
  assert.equal((await as(A, `select public.is_admin() v`))[0].v, true); ok();
  assert.equal((await as(B, `select public.is_admin() v`))[0].v, false); ok();
  const overview = (await as(A, `select public.admin_overview() o`))[0].o;
  assert.equal(overview.users, 4); assert.equal(overview.admins, 1); assert.equal(overview.pending_reports, 0); ok();
  await assert.rejects(as(B, `select public.admin_overview()`), /Only admins/); ok();
  await assert.rejects(as(B, `select * from public.admin_audit_log()`), /Only admins/); ok();
});
console.log('ADMINS: only rows in public.admins pass; adding one is audited');

// ---------------------------------------------------------------- 3. reports + moderation
const P = { pub: uid(101), priv: uid(102), removed: uid(103), absA: uid(104) };
await db.exec(`insert into public.contents (id, user_id, title, content, abstract, visibility_mode) values
  ('${P.pub}','${A}','Public post','public body',null,'public'),
  ('${P.priv}','${A}','Private post','private body',null,'private'),
  ('${P.removed}','${C}','Spam post','buy now',null,'public'),
  ('${P.absA}','${A}','Abstract post','secret body','abs','abstract_only');`);
await db.exec(`insert into public.content_attachments (content_id, file_url, storage_path, original_name, attachment_type, bucket_name, access_level)
  values ('${P.removed}','https://x.supabase.co/storage/v1/object/public/content-files/uploads/${C}/${P.removed}/1.pdf','uploads/${C}/${P.removed}/1.pdf','1.pdf','document','content-files','public')`);
await db.exec(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('content-files','uploads/${C}/${P.removed}/1.pdf','${C}','${C}')`);
// Rows written before Phase 4 could name any file. One names A's private paper;
// an extracted image is C's own.
await db.exec(`insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('restricted-papers','uploads/${A}/${P.absA}/paper.pdf','${A}','${A}'),
  ('content-images','uploads/${C}/${P.removed}/img-1.png',null,null)`);
await db.exec(`insert into public.content_attachments (content_id, file_url, storage_path, original_name, attachment_type, bucket_name, access_level)
  values ('${P.removed}','','uploads/${A}/${P.absA}/paper.pdf','paper.pdf','document','restricted-papers','restricted')`);
await db.exec(`insert into public.paper_extracted_images (content_id, image_url, storage_path) values ('${P.removed}','x','uploads/${C}/${P.removed}/img-1.png')`);

await check('post files', async () => {
  const add = (who, post, path, bucket = 'content-files') => as(who,
    `insert into public.content_attachments (content_id, file_url, storage_path, original_name, attachment_type, bucket_name, access_level)
     values ($1, '', $2, 'x.pdf', 'document', $3, 'public')`, [post, path, bucket]);
  await assert.rejects(add(C, P.removed, `uploads/${A}/${P.absA}/paper.pdf`, 'restricted-papers'), /row-level security/, 'cannot list someone else\'s file'); ok();
  await assert.rejects(add(C, P.removed, `uploads/${C}/${uid(999)}/x.pdf`), /row-level security/, 'only this post\'s folder'); ok();
  await assert.rejects(add(C, P.removed, `uploads/${C}/${P.removed}/x.pdf`, 'chat-attachments'), /row-level security/, 'only post buckets'); ok();
  await assert.rejects(add(B, P.removed, `uploads/${B}/${P.removed}/x.pdf`), /row-level security/, 'only the post author'); ok();
  await add(C, P.removed, `uploads/${C}/${P.removed}/2.pdf`); ok();
});
console.log('POST FILES: a post lists only files from its author\'s own folder for that post');

await check('reports', async () => {
  await as(B, `insert into public.post_reports (content_id, reporter_id, reason, details, status) values ('${P.pub}','${B}','spam','looks off','pending')`); ok();
  assert.equal((await as(B, `select id, reason, status, details from public.post_reports where reporter_id = '${B}'`)).length, 1, 'reporter reads own report'); ok();
  await assert.rejects(as(B, `select resolved_by, resolution_note from public.post_reports`), /permission denied/, 'but not who handled it'); ok();
  await assert.rejects(as(C, `insert into public.post_reports (content_id, reporter_id, reason, status) values ('${P.pub}','${C}','spam','action_taken')`), /row-level security/, 'cannot file a resolved report'); ok();
  await assert.rejects(as(B, `insert into public.post_reports (content_id, reporter_id, reason, status) values ('${P.priv}','${B}','spam','pending')`), /row-level security/, 'cannot report a post you cannot see'); ok();
  await assert.rejects(as(B, `update public.post_reports set status = 'dismissed' where reporter_id = '${B}'`), /permission denied/, 'reporter cannot set the outcome'); ok();
  await as(B, `update public.post_reports set details = 'edited' where reporter_id = '${B}'`);
  assert.equal((await one(`select details from public.post_reports where reporter_id = '${B}'`)).details, 'edited', 'reporter can still edit details'); ok();
  await as(C, `insert into public.post_reports (content_id, reporter_id, reason, status) values ('${P.pub}','${C}','harassment','pending')`);
  await as(B, `insert into public.post_reports (content_id, reporter_id, reason, status) values ('${P.removed}','${B}','spam','pending')`);

  const queue = await as(A, `select * from public.admin_report_queue('pending')`);
  assert.equal(queue.length, 2); ok();
  const pubRow = queue.find((r) => r.content_id === P.pub);
  assert.equal(Number(pubRow.report_count), 2);
  assert.deepEqual([...pubRow.reasons].sort(), ['harassment', 'spam']);
  assert.deepEqual(pubRow.details, ['edited']);
  assert.equal(pubRow.post_author_name, 'Alice Admin'); ok();
  await assert.rejects(as(B, `select * from public.admin_report_queue('pending')`), /Only admins/); ok();

  const closed = (await as(A, `select public.admin_dismiss_reports('${P.pub}', 'not spam') n`))[0].n;
  assert.equal(closed, 2); ok();
  assert.equal((await as(A, `select * from public.admin_report_queue('pending')`)).length, 1); ok();
  const resolved = await as(A, `select * from public.admin_report_queue('resolved')`);
  assert.equal(resolved.length, 1); assert.equal(resolved[0].resolution_note, 'not spam'); ok();
  await assert.rejects(as(A, `select public.admin_dismiss_reports('${P.pub}', null)`), /no open reports/); ok();
  assert.equal(await auditCount('reports.dismissed'), 1); ok();

  await assert.rejects(as(B, `select public.admin_remove_post('${P.removed}', 'spam')`), /Only admins/); ok();
  await assert.rejects(as(A, `select public.admin_remove_post('${P.removed}', '  ')`), /Give a reason/); ok();
  const removed = (await as(A, `select public.admin_remove_post('${P.removed}', 'Advertising') r`))[0].r;
  assert.deepEqual(removed.files, [
    { bucket: 'content-files', path: `uploads/${C}/${P.removed}/1.pdf` },
    { bucket: 'content-images', path: `uploads/${C}/${P.removed}/img-1.png` },
  ], 'the author\'s files only (not A\'s paper the post named), extracted images too'); ok();
  assert.equal(Number((await one(`select count(*) n from public.contents where id = '${P.removed}'`)).n), 0); ok();
  const notice = await one(`select * from public.notifications where recipient_id = '${C}' and notification_type = 'system'`);
  assert.match(notice.body, /Spam post.*Advertising/); assert.equal(notice.actor_id, null); ok();
  const audit = await one(`select * from public.audit_log where action = 'post.removed'`);
  assert.equal(audit.actor_id, A); assert.equal(audit.details.reports, 1); assert.equal(audit.details.author_id, C); ok();
  // Removing the files: only an admin (or the uploader) may.
  await as(B, `delete from storage.objects where name = 'uploads/${C}/${P.removed}/1.pdf'`);
  assert.equal(Number((await one(`select count(*) n from storage.objects where name = 'uploads/${C}/${P.removed}/1.pdf'`)).n), 1, 'B cannot delete'); ok();
  await as(A, `delete from storage.objects where name = 'uploads/${C}/${P.removed}/1.pdf'`);
  assert.equal(Number((await one(`select count(*) n from storage.objects where name = 'uploads/${C}/${P.removed}/1.pdf'`)).n), 0, 'admin can delete'); ok();
  const log = await as(A, `select * from public.admin_audit_log(10)`);
  assert.deepEqual(log.map((r) => r.action).slice(0, 3), ['post.removed', 'reports.dismissed', 'admin.added']); ok();
  assert.equal(log[0].actor_name, 'Alice Admin'); ok();
  const older = await as(A, `select * from public.admin_audit_log(10, ${log[0].id})`);
  assert.equal(older[0].action, 'reports.dismissed', 'paging by id'); ok();
});
console.log('MODERATION: reports start pending and stay visible-only; queue, dismiss, remove (+files, notice, audit)');

// ---------------------------------------------------------------- 4. workspaces (RG-20)
let W1, W2, chatW1;
await check('workspaces', async () => {
  W1 = (await as(A, `select public.create_workspace('Shared lab', 'desc', 'AI', null, 'shared') id`))[0].id;
  assert.ok(W1); ok();
  assert.equal((await one(`select role from public.workspace_members where workspace_id = '${W1}' and user_id = '${A}'`)).role, 'owner'); ok();
  chatW1 = (await one(`select id from public.conversations where workspace_id = '${W1}' and conversation_type = 'workspace_group'`)).id;
  assert.equal((await one(`select role from public.conversation_members where conversation_id = '${chatW1}' and user_id = '${A}'`)).role, 'owner'); ok();
  await assert.rejects(as(A, `select public.create_workspace('  ')`), /Add a workspace title/); ok();
  await assert.rejects(as(A, `select public.create_workspace('x', null, null, null, 'team')`), /personal or shared/); ok();

  W2 = (await as(A, `select public.create_workspace('Solo') id`))[0].id;
  assert.equal(Number((await one(`select count(*) n from public.conversations where workspace_id = '${W2}'`)).n), 0, 'personal: no chat'); ok();
  await assert.rejects(as(A, `select public.add_workspace_member('${W2}', '${B}')`), /Make this workspace shared first/); ok();
  const chatW2 = (await as(A, `select public.make_workspace_shared('${W2}') id`))[0].id;
  assert.equal((await as(A, `select public.make_workspace_shared('${W2}') id`))[0].id, chatW2, 'shared twice: same chat'); ok();
  await assert.rejects(as(B, `select public.make_workspace_shared('${W2}')`), /Only the workspace owner/); ok();

  await as(A, `select public.add_workspace_member('${W1}', '${B}')`);
  assert.equal(Number((await one(`select count(*) n from public.workspace_members where workspace_id = '${W1}' and user_id = '${B}'`)).n), 1); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversation_members where conversation_id = '${chatW1}' and user_id = '${B}'`)).n), 1, 'added to the group chat too'); ok();
  assert.equal(await auditCount('workspace.member_added'), 1, 'owner rows are not logged, members are'); ok();
  await assert.rejects(as(A, `select public.add_workspace_member('${W1}', '${B}')`), /already a member/); ok();
  await assert.rejects(as(A, `select public.add_workspace_member('${W1}', '${D}')`), /connected with/); ok();
  await assert.rejects(as(A, `insert into public.workspace_members (workspace_id, user_id, role) values ('${W1}','${D}','member')`), /row-level security/, 'direct insert of a stranger is refused too'); ok();
  await assert.rejects(as(B, `select public.add_workspace_member('${W1}', '${A}')`), /Only the workspace owner/); ok();

  // All or nothing: when the chat step fails, the membership is not kept either.
  await db.exec(`create function test.boom() returns trigger language plpgsql as $$ begin raise exception 'chat insert failed'; end $$;
                 create trigger boom before insert on public.conversation_members for each row execute function test.boom();`);
  await db.exec(`insert into public.profile_requests (requester_id, receiver_id, status) values ('${C}','${A}','accepted')`);
  await assert.rejects(as(A, `select public.add_workspace_member('${W1}', '${C}')`), /chat insert failed/); ok();
  assert.equal(Number((await one(`select count(*) n from public.workspace_members where workspace_id = '${W1}' and user_id = '${C}'`)).n), 0, 'rolled back'); ok();
  await assert.rejects(as(A, `select public.create_workspace('Half', null, null, null, 'shared')`), /chat insert failed/); ok();
  assert.equal(Number((await one(`select count(*) n from public.workspaces where title = 'Half'`)).n), 0, 'no half-made workspace'); ok();
  await db.exec(`drop trigger boom on public.conversation_members; delete from public.profile_requests where requester_id = '${C}';`);

  const bRow = await one(`select id from public.workspace_members where workspace_id = '${W1}' and user_id = '${B}'`);
  const ownerRow = await one(`select id from public.workspace_members where workspace_id = '${W1}' and user_id = '${A}'`);
  await assert.rejects(as(A, `select public.remove_workspace_member('${ownerRow.id}')`), /owner cannot be removed/); ok();
  await assert.rejects(as(B, `select public.remove_workspace_member('${bRow.id}')`), /Only the workspace owner/); ok();
  await as(A, `select public.remove_workspace_member('${bRow.id}')`);
  assert.equal(Number((await one(`select count(*) n from public.workspace_members where workspace_id = '${W1}' and user_id = '${B}'`)).n), 0); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversation_members where conversation_id = '${chatW1}' and user_id = '${B}'`)).n), 0, 'and from the chat'); ok();
  assert.equal(await auditCount('workspace.member_removed'), 1); ok();
  await as(A, `select public.add_workspace_member('${W1}', '${B}')`); // back in for later tests
});
console.log('WORKSPACES: create/share/add/remove are single calls; a failed step undoes the others');

// ---------------------------------------------------------------- 5. direct chats
let chatAB;
await check('direct chats', async () => {
  chatAB = (await as(A, `select public.start_direct_conversation('${B}') id`))[0].id;
  assert.equal((await as(A, `select public.start_direct_conversation('${B}') id`))[0].id, chatAB, 'same chat again'); ok();
  assert.equal((await as(B, `select public.start_direct_conversation('${A}') id`))[0].id, chatAB, 'from the other side too'); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversation_members where conversation_id = '${chatAB}'`)).n), 2); ok();
  await assert.rejects(as(A, `select public.start_direct_conversation('${D}')`), /connected with/); ok();
  await assert.rejects(as(A, `select public.start_direct_conversation('${A}')`), /another researcher/); ok();
  await assert.rejects(as(A, `insert into public.conversations (participant_one_id, participant_two_id, conversation_type, created_by) values ('${A}','${D}','direct','${A}')`), /row-level security/, 'no direct chat with a stranger'); ok();
  // The other kinds of chat are no way around that rule.
  await assert.rejects(as(D, `insert into public.conversations (participant_one_id, participant_two_id, conversation_type, created_by) values ('${D}','${A}','collaboration','${D}')`), /row-level security/, 'collaboration chat needs a request'); ok();
  await assert.rejects(as(D, `insert into public.conversations (participant_one_id, participant_two_id, conversation_type, created_by) values ('${D}','${A}','workspace_group','${D}')`), /row-level security/, 'group chat needs a workspace'); ok();
  const W3 = (await as(D, `select public.create_workspace('D lab') id`))[0].id;
  await assert.rejects(as(D, `insert into public.conversations (participant_one_id, participant_two_id, conversation_type, workspace_id, created_by) values ('${D}','${A}','workspace_group','${W3}','${D}')`), /row-level security/, 'group chat is made by the owner alone'); ok();
  await as(D, `insert into public.conversations (participant_one_id, participant_two_id, conversation_type, workspace_id, created_by) values ('${D}','${D}','workspace_group','${W3}','${D}')`); ok();
  await assert.rejects(as(D, `insert into public.conversations (participant_one_id, participant_two_id, conversation_type, created_by) values ('${A}','${B}','direct','${D}')`), /row-level security/, 'only your own chats'); ok();
  await as(A, `delete from public.conversation_members where conversation_id = '${chatAB}' and user_id = '${A}'`);
  assert.equal((await as(A, `select public.start_direct_conversation('${B}') id`))[0].id, chatAB, 'leaving and coming back reuses the chat'); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversation_members where conversation_id = '${chatAB}'`)).n), 2); ok();
});
console.log('DIRECT CHATS: one chat per pair, both members, connected people only');

// ---------------------------------------------------------------- 6. requests (RG-20)
await check('requests', async () => {
  // Profile request C -> A, accepted: connection + notice, in one call.
  await as(C, `insert into public.profile_requests (requester_id, receiver_id, status) values ('${C}','${A}','pending')`);
  const pr = await one(`select id from public.profile_requests where requester_id = '${C}'`);
  await assert.rejects(as(B, `select public.respond_to_profile_request('${pr.id}', 'accepted')`), /Only the person who received/); ok();
  await assert.rejects(as(A, `select public.respond_to_profile_request('${pr.id}', 'maybe')`), /accept or decline/); ok();
  await as(A, `select public.respond_to_profile_request('${pr.id}', 'accepted')`);
  const [lo, hi] = [A, C].sort();
  assert.equal(Number((await one(`select count(*) n from public.user_connections where user_one_id = '${lo}' and user_two_id = '${hi}'`)).n), 1); ok();
  assert.equal((await one(`select title from public.notifications where recipient_id = '${C}' and request_kind = 'profile'`)).title, 'Profile request accepted'); ok();
  await assert.rejects(as(A, `select public.respond_to_profile_request('${pr.id}', 'declined')`), /already answered/); ok();

  // Research request B -> A on A's post: accepted -> collaboration chat + notice with its link.
  await as(B, `insert into public.research_requests (content_id, requester_id, receiver_id, status) values ('${P.pub}','${B}','${A}','pending')`);
  const rr = await one(`select id from public.research_requests where requester_id = '${B}'`);
  // Sending a request does not open a chat with the receiver: only they can, or an acceptance.
  await assert.rejects(as(B, `select public.open_research_conversation('${rr.id}')`), /once it is accepted/); ok();
  await assert.rejects(as(B, `insert into public.conversations (request_id, participant_one_id, participant_two_id, conversation_type, created_by) values ('${rr.id}','${B}','${A}','collaboration','${B}')`), /row-level security/); ok();
  await assert.rejects(as(B, `insert into public.conversations (request_id, participant_one_id, participant_two_id, conversation_type, created_by) values ('${rr.id}','${B}','${D}','collaboration','${B}')`), /row-level security/, 'only the request\'s two people'); ok();
  const chat = (await as(A, `select public.respond_to_research_request('${rr.id}', 'accepted') id`))[0].id;
  const conv = await one(`select * from public.conversations where id = '${chat}'`);
  assert.equal(conv.conversation_type, 'collaboration'); assert.equal(conv.request_id, rr.id); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversation_members where conversation_id = '${chat}'`)).n), 2); ok();
  assert.equal((await one(`select link_url from public.notifications where request_id = '${rr.id}'`)).link_url, `/messages?conversation=${chat}`); ok();
  assert.equal((await as(B, `select public.open_research_conversation('${rr.id}') id`))[0].id, chat, 'reopening gives the same chat'); ok();

  // Declined: no chat; reopening is refused.
  await as(C, `insert into public.research_requests (content_id, requester_id, receiver_id, status) values ('${P.pub}','${C}','${A}','pending')`);
  const rr2 = await one(`select id from public.research_requests where requester_id = '${C}'`);
  // Before answering, the receiver may already message the requester.
  const early = (await as(A, `select public.open_research_conversation('${rr2.id}') id`))[0].id;
  assert.ok(early); ok();
  await as(C, `insert into public.messages (conversation_id, sender_id, body) values ('${early}','${C}','thanks for writing')`); ok();
  assert.equal((await as(A, `select public.respond_to_research_request('${rr2.id}', 'declined') id`))[0].id, null); ok();
  await assert.rejects(as(C, `select public.open_research_conversation('${rr2.id}')`), /declined/); ok();
  await assert.rejects(as(D, `select public.open_research_conversation('${rr.id}')`), /not found/); ok();
  // A declined request's chat stays readable but takes nothing new.
  assert.equal((await as(C, `select body from public.messages where conversation_id = '${early}'`)).length, 1); ok();
  await assert.rejects(as(C, `insert into public.messages (conversation_id, sender_id, body) values ('${early}','${C}','one more thing')`), /row-level security/); ok();
  await assert.rejects(as(A, `insert into public.messages (conversation_id, sender_id, body) values ('${early}','${A}','hi')`), /row-level security/); ok();
  await assert.rejects(as(C, `insert into storage.objects (bucket_id, name, owner, owner_id) values ('chat-attachments','${early}/${C}/x.pdf','${C}','${C}')`), /row-level security/, 'no uploads either'); ok();

  // All or nothing: a failing notice keeps the request pending.
  await as(D, `insert into public.research_requests (content_id, requester_id, receiver_id, status) values ('${P.pub}','${D}','${A}','pending')`);
  const rr3 = await one(`select id from public.research_requests where requester_id = '${D}'`);
  await db.exec(`create trigger boom before insert on public.notifications for each row execute function test.boom();`);
  await assert.rejects(as(A, `select public.respond_to_research_request('${rr3.id}', 'accepted')`), /chat insert failed/); ok();
  assert.equal((await one(`select status from public.research_requests where id = '${rr3.id}'`)).status, 'pending', 'rolled back'); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversations where request_id = '${rr3.id}'`)).n), 0, 'no chat left behind'); ok();
  await db.exec(`drop trigger boom on public.notifications;`);

  // Paper access C -> A's abstract-only post: approved -> C can read the text; audited.
  await as(C, `insert into public.paper_access_requests (content_id, requester_id, owner_id, status) values ('${P.absA}','${C}','${A}','pending')`);
  const par = await one(`select id from public.paper_access_requests where requester_id = '${C}'`);
  await assert.rejects(as(C, `select public.respond_to_paper_access_request('${par.id}', 'approved')`), /author can answer/); ok();
  const textsBefore = await as(C, `select * from public.readable_post_texts($1)`, [[P.absA]]);
  assert.equal(textsBefore.length, 0); ok();
  await as(A, `select public.respond_to_paper_access_request('${par.id}', 'approved')`);
  const parRow = await one(`select * from public.paper_access_requests where id = '${par.id}'`);
  assert.equal(parRow.status, 'approved'); assert.ok(parRow.approved_at); assert.equal(parRow.rejected_at, null); ok();
  assert.equal((await as(C, `select * from public.readable_post_texts($1)`, [[P.absA]]))[0].content, 'secret body'); ok();
  assert.equal(await auditCount('paper_access.approved'), 1); ok();
  assert.equal((await one(`select link_url from public.notifications where request_id = '${par.id}'`)).link_url, `/feed?post=${P.absA}`); ok();
});
console.log('REQUESTS: answer + chat/connection + notice happen together; answered once; failures roll back');

// ---------------------------------------------------------------- 6b. restricted papers
await check('restricted papers', async () => {
  const paper = `uploads/${A}/${P.absA}/paper.pdf`;
  await as(A, `insert into public.content_attachments (content_id, file_url, storage_path, original_name, attachment_type, bucket_name, access_level, file_role, is_full_paper)
               values ('${P.absA}', '', '${paper}', 'paper.pdf', 'document', 'restricted-papers', 'restricted', 'full_paper', true)`);
  const canRead = async (who) => (await as(who, `select name from storage.objects where bucket_id = 'restricted-papers' and name = $1`, [paper])).length === 1;
  assert.equal(await canRead(A), true, 'author'); ok();
  assert.equal(await canRead(C), true, 'approved reader'); ok();
  assert.equal(await canRead(B), false, 'nobody else'); ok();

  // A post that names someone else's paper (possible before Phase 4) opens nothing:
  // D approves B's request on D's own post, which names A's paper.
  const PD = uid(105);
  await db.exec(`insert into public.contents (id, user_id, title, content, abstract, content_category, full_paper_access_mode) values ('${PD}','${D}','D paper','d body','abs','research_paper','request_required')`);
  await db.exec(`insert into public.content_attachments (content_id, file_url, storage_path, original_name, attachment_type, bucket_name, access_level) values ('${PD}','','${paper}','paper.pdf','document','restricted-papers','restricted')`);
  await as(B, `insert into public.paper_access_requests (content_id, requester_id, owner_id, status) values ('${PD}','${B}','${D}','pending')`);
  const parD = await one(`select id from public.paper_access_requests where content_id = '${PD}'`);
  await as(D, `select public.respond_to_paper_access_request('${parD.id}', 'approved')`);
  assert.equal(await canRead(B), false, 'approval on another post does not open A\'s paper'); ok();
  assert.equal(await canRead(D), false); ok();
});
console.log('RESTRICTED PAPERS: author and approved readers only; a post cannot point at someone else\'s paper');

// ---------------------------------------------------------------- 7. create_post (RG-20)
await check('create_post', async () => {
  const P2 = uid(201);
  const pubPath = `uploads/${A}/${P2}/1-0.png`;
  const paperPath = `uploads/${A}/${P2}/1-1.pdf`;
  await db.exec(`insert into storage.objects (bucket_id, name, owner, owner_id) values
    ('content-files','${pubPath}','${A}','${A}'), ('restricted-papers','${paperPath}','${A}','${A}')`);
  const files = [
    { storage_path: paperPath, bucket_name: 'restricted-papers', file_url: '', original_name: 'paper.pdf', mime_type: 'application/pdf', file_ext: 'pdf', file_size: 1000, attachment_type: 'document', file_role: 'full_paper' },
    { storage_path: pubPath, bucket_name: 'content-files', file_url: `https://abc.supabase.co/storage/v1/object/public/content-files/${pubPath}`, original_name: 'fig.png', mime_type: 'image/png', file_ext: 'png', file_size: 10, attachment_type: 'image', file_role: 'attachment' },
  ];
  const authors = [{ profile_id: B }, { manual_name: 'Outside Person' }];
  const call = (who, id, overrides = {}) => as(who,
    `select public.create_post($1, $2, $3, $4, 'research_note', $5, 'public', $6, null, 'ai, ml', $7::jsonb, $8::jsonb) id`,
    [id, overrides.title ?? 'A paper', overrides.content ?? 'body text', overrides.abstract ?? 'the abstract',
     overrides.category ?? 'research_paper', overrides.access ?? 'request_required',
     JSON.stringify(overrides.authors ?? authors), JSON.stringify(overrides.files ?? files)]);

  // Each failure leaves no post behind.
  const noPost = async (id) => assert.equal(Number((await one(`select count(*) n from public.contents where id = '${id}'`)).n), 0);
  await assert.rejects(call(A, P2, { files: [{ ...files[0], storage_path: `uploads/${A}/${uid(999)}/x.pdf` }] }), /does not belong/); await noPost(P2); ok();
  await assert.rejects(call(A, P2, { files: [{ ...files[0], bucket_name: 'content-files' }] }), /wrong place/, 'restricted paper never public'); await noPost(P2); ok();
  await assert.rejects(call(A, P2, { files: [{ ...files[1], storage_path: `uploads/${A}/${P2}/missing.png`, file_url: `https://abc.supabase.co/storage/v1/object/public/content-files/uploads/${A}/${P2}/missing.png` }] }), /did not finish uploading/); await noPost(P2); ok();
  await assert.rejects(call(A, P2, { files: [{ ...files[1], file_url: 'https://evil.example/phish' }] }), /link is not valid/); await noPost(P2); ok();
  await assert.rejects(call(A, P2, { abstract: '' }), /abstract is required/); await noPost(P2); ok();
  await assert.rejects(call(B, P2), /does not belong/, 'B cannot attach A files'); await noPost(P2); ok();

  assert.equal((await call(A, P2))[0].id, P2); ok();
  const post = await one(`select * from public.contents where id = '${P2}'`);
  assert.equal(post.user_id, A); assert.equal(post.allow_full_paper_request, true); assert.equal(post.keywords, 'ai, ml'); ok();
  const authorsRows = await q(`select profile_id, manual_name, author_order from public.content_authors where content_id = '${P2}' order by author_order`);
  assert.deepEqual(authorsRows.map((r) => [r.profile_id, r.manual_name, r.author_order]), [[B, null, 1], [null, 'Outside Person', 2]]); ok();
  const att = await q(`select bucket_name, access_level, file_role, is_full_paper, is_preview_file, file_url from public.content_attachments where content_id = '${P2}' order by file_role desc`);
  assert.deepEqual(att.map((r) => [r.bucket_name, r.access_level, r.file_role, r.is_full_paper, r.is_preview_file]),
    [['restricted-papers', 'restricted', 'full_paper', true, false], ['content-files', 'public', 'attachment', false, true]]); ok();
  assert.equal(att[0].file_url, ''); ok();

  // A plain post without files still works.
  const P3 = uid(202);
  await call(A, P3, { category: 'general_post', access: 'public', abstract: '', files: [], authors: [] }); ok();
});
console.log('CREATE_POST: post + co-authors + files in one call; paths, buckets, links and uploads are checked');

// ---------------------------------------------------------------- 8. messages
await check('messages', async () => {
  // Server-side time and fields, whatever the browser sends.
  await as(B, `insert into public.messages (conversation_id, sender_id, body, created_at, is_deleted, read_at) values ('${chatAB}','${B}','hello', '2001-01-01', true, now())`);
  const m = await one(`select * from public.messages where conversation_id = '${chatAB}' order by created_at desc limit 1`);
  assert.ok(new Date(m.created_at).getFullYear() > 2020, 'created_at from the database'); assert.equal(m.is_deleted, false); assert.equal(m.read_at, null); ok();
  const conv = await one(`select last_message_at from public.conversations where id = '${chatAB}'`);
  assert.equal(new Date(conv.last_message_at).getTime(), new Date(m.created_at).getTime(), 'chat moved to the top in the same step'); ok();
  await assert.rejects(as(B, `insert into public.messages (conversation_id, sender_id, body) values ('${chatAB}','${B}','   ')`), /needs text or an attachment/); ok();
  // A chat time in the future (browsers could set one before) is replaced by the next message.
  await db.exec(`update public.conversations set last_message_at = '2099-01-01' where id = '${chatAB}'`);
  await as(B, `insert into public.messages (conversation_id, sender_id, body) values ('${chatAB}','${B}','still here')`);
  assert.ok(new Date((await one(`select last_message_at from public.conversations where id = '${chatAB}'`)).last_message_at).getFullYear() < 2099); ok();

  // Attachments: the file must be in this chat's folder, in the sender's own folder, and uploaded.
  const path = `${chatAB}/${B}/1-report.pdf`;
  const send = (who, p, kind = 'file') => as(who, `insert into public.messages (conversation_id, sender_id, body, attachment_path, attachment_name, attachment_type, attachment_size, attachment_kind)
    values ('${chatAB}','${who}', null, '${p}', 'report.pdf', 'application/pdf', 1234, '${kind}')`);
  await assert.rejects(send(B, path), /row-level security/, 'not uploaded yet'); ok();
  await assert.rejects(as(D, `insert into storage.objects (bucket_id, name, owner, owner_id) values ('chat-attachments','${chatAB}/${D}/x.pdf','${D}','${D}')`), /row-level security/, 'outsider cannot upload into the chat'); ok();
  await assert.rejects(as(B, `insert into storage.objects (bucket_id, name, owner, owner_id) values ('chat-attachments','${chatAB}/${A}/x.pdf','${B}','${B}')`), /row-level security/, 'not into someone else\'s folder'); ok();
  await as(B, `insert into storage.objects (bucket_id, name, owner, owner_id) values ('chat-attachments','${path}','${B}','${B}')`); ok();
  await assert.rejects(send(B, path, 'video'), /messages_attachment_valid/); ok();
  await send(B, path); ok();
  await assert.rejects(as(A, `insert into public.messages (conversation_id, sender_id, attachment_path, attachment_name, attachment_kind) values ('${chatAB}','${A}','${path}','report.pdf','file')`), /messages_attachment_valid/, 'cannot re-send someone else\'s file'); ok();
  assert.equal((await as(A, `select name from storage.objects where bucket_id = 'chat-attachments'`)).length, 1, 'chat members can read the file'); ok();
  assert.equal((await as(D, `select name from storage.objects where bucket_id = 'chat-attachments'`)).length, 0, 'others cannot'); ok();
  await as(A, `delete from storage.objects where name = '${path}'`);
  assert.equal(Number((await one(`select count(*) n from storage.objects where name = '${path}'`)).n), 1, 'only the uploader deletes'); ok();

  // Summaries: preview for attachment-only messages, and the mute flag.
  let sum = (await as(A, `select * from public.my_conversation_summaries() where conversation_id = '${chatAB}'`))[0];
  assert.equal(sum.last_message_body, 'File: report.pdf'); assert.equal(sum.muted, false); assert.equal(Number(sum.unread_count), 3); ok();
  await as(A, `update public.conversation_members set muted = true where conversation_id = '${chatAB}' and user_id = '${A}'`);
  sum = (await as(A, `select * from public.my_conversation_summaries() where conversation_id = '${chatAB}'`))[0];
  assert.equal(sum.muted, true); ok();
  assert.equal((await as(B, `select * from public.my_conversation_summaries() where conversation_id = '${chatAB}'`))[0].muted, false, 'mute is per person'); ok();
  // The other person cannot mute B's chat or mark it read for B (the change is ignored).
  const bBefore = await one(`select muted, last_read_at from public.conversation_members where conversation_id = '${chatAB}' and user_id = '${B}'`);
  await as(A, `update public.conversation_members set muted = true, last_read_at = now() + interval '1 day' where conversation_id = '${chatAB}' and user_id = '${B}'`);
  const bAfter = await one(`select muted, last_read_at from public.conversation_members where conversation_id = '${chatAB}' and user_id = '${B}'`);
  assert.deepEqual(bAfter, bBefore); ok();

  // After-deploy SQL: browsers no longer change conversations directly.
  await assert.rejects(as(B, `update public.conversations set last_message_at = now() + interval '1 year' where id = '${chatAB}'`), /permission denied/); ok();
});
console.log('MESSAGES: server time, chat bumped by the database, attachments checked end to end, mute flag');

// ---------------------------------------------------------------- 9. Jitsi rooms (RG-22)
await check('jitsi', async () => {
  const row = (await as(A, `insert into public.workspace_meetings (workspace_id, created_by, title, room_name, meeting_url) values ('${W1}','${A}','Standup','researchgram-guessable','https://meet.jit.si/researchgram-guessable') returning room_name, meeting_url, provider`))[0];
  assert.match(row.room_name, /^ResearchGram-[0-9a-f]{32}$/); ok();
  assert.equal(row.meeting_url, `https://meet.jit.si/${row.room_name}`); assert.equal(row.provider, 'jitsi'); ok();
  const row2 = (await as(A, `insert into public.workspace_meetings (workspace_id, created_by, title, room_name, meeting_url) values ('${W1}','${A}','Again','x','x') returning room_name`))[0];
  assert.notEqual(row2.room_name, row.room_name); ok();
});
console.log('JITSI: room names are random and made by the database');

// ---------------------------------------------------------------- 10. ORCID
const ORCID = '0000-0002-1825-0097';
await check('orcid', async () => {
  await as(B, `update public.profiles set orcid_id = '${ORCID}', orcid_verified_at = now() where id = '${B}'`);
  assert.equal((await one(`select orcid_verified_at from public.profiles where id = '${B}'`)).orcid_verified_at, null, 'browser cannot verify'); ok();
  await assert.rejects(as(B, `select * from public.verify_orcid('code', 'https://app.example/profile/orcid')`), /not set up yet/); ok();

  // Not configured: metrics sync works as in Phase 3.
  await db.exec(`insert into test.http_fixtures (method, uri, status, content) values
    ('GET','https://api.openalex.org/authors/orcid:${ORCID}',200,'{"works_count":12,"cited_by_count":340,"summary_stats":{"h_index":7}}')`);
  await as(B, `select * from public.sync_my_research_metrics('${ORCID}')`);
  assert.equal((await one(`select external_h_index from public.profiles where id = '${B}'`)).external_h_index, 7); ok();

  // Configure ORCID sign-in.
  await db.exec(`insert into vault.decrypted_secrets (name, decrypted_secret) values ('orcid_client_id','APP-TEST'), ('orcid_client_secret','s3cr&t=1')`);
  await db.exec(`update public.profiles set external_metrics_synced_at = now() - interval '1 hour' where id = '${B}'`);
  await assert.rejects(as(B, `select * from public.sync_my_research_metrics('${ORCID}')`), /Verify your ORCID iD first/, 'unverified iD no longer syncs'); ok();

  await db.exec(`insert into test.http_fixtures (method, uri, status, content) values ('POST','https://orcid.org/oauth/token',200,'{"access_token":"t","orcid":"${ORCID}","name":"Bob"}')`);
  await assert.rejects(as(B, `select * from public.verify_orcid('code', 'javascript:alert(1)')`), /did not finish/); ok();
  const v = (await as(B, `select * from public.verify_orcid('code-123', 'https://app.example/profile/orcid')`))[0];
  assert.equal(v.orcid_id, ORCID); assert.ok(v.verified_at); assert.equal(v.problem, null); ok();
  const call = await one(`select * from test.http_calls where method = 'POST' order by at desc limit 1`);
  assert.equal(call.content_type, 'application/x-www-form-urlencoded');
  assert.equal(call.content, 'client_id=APP-TEST&client_secret=s3cr%26t%3D1&grant_type=authorization_code&code=code-123&redirect_uri=https%3A%2F%2Fapp.example%2Fprofile%2Forcid'); ok();
  const bRow = await one(`select external_h_index, orcid_verified_at from public.profiles where id = '${B}'`);
  assert.equal(bRow.external_h_index, 7, 'same iD keeps its numbers'); ok();
  assert.equal(await auditCount('orcid.verified'), 1); ok();
  await assert.rejects(as(B, `select * from public.verify_orcid('code-2', 'https://app.example/profile/orcid')`), /Wait a few seconds/); ok();

  // Verified: sync allowed for that iD only.
  await db.exec(`update public.profiles set external_metrics_synced_at = now() - interval '1 hour' where id = '${B}'`);
  await db.exec(`delete from public.action_rate_limits where action = 'sync_my_research_metrics'`);
  await as(B, `select * from public.sync_my_research_metrics('${ORCID}')`); ok();
  await assert.rejects(as(B, `select * from public.sync_my_research_metrics('0000-0001-5109-3700')`), /Verify your ORCID iD first/); ok();

  // Someone else cannot verify the same iD.
  const other = (await as(C, `select * from public.verify_orcid('code-c', 'https://app.example/profile/orcid')`))[0];
  assert.match(other.problem, /already verified on another/); assert.equal(other.orcid_id, null); ok();
  assert.equal((await one(`select orcid_verified_at from public.profiles where id = '${C}'`)).orcid_verified_at, null); ok();

  // A failed exchange is reported as a problem, and still counts for the
  // rate limit (an error would have undone that record).
  await db.exec(`update test.http_fixtures set status = 400, content = '{"error":"invalid_grant"}' where method = 'POST'`);
  await db.exec(`delete from public.action_rate_limits`);
  const failed = (await as(B, `select * from public.verify_orcid('used-code', 'https://app.example/profile/orcid')`))[0];
  assert.match(failed.problem, /did not confirm/); assert.equal(failed.orcid_id, null); ok();
  const callsBefore = Number((await one(`select count(*) n from test.http_calls where method = 'POST'`)).n);
  await assert.rejects(as(B, `select * from public.verify_orcid('again', 'https://app.example/profile/orcid')`), /Wait a few seconds/); ok();
  assert.equal(Number((await one(`select count(*) n from test.http_calls where method = 'POST'`)).n), callsBefore, 'ORCID not asked again'); ok();
  await db.exec(`update test.http_fixtures set status = 200, content = 'not json' where method = 'POST'`);
  await db.exec(`delete from public.action_rate_limits`);
  assert.match((await as(B, `select * from public.verify_orcid('code-3', 'https://app.example/profile/orcid')`))[0].problem, /could not read/); ok();

  // Metrics sync: a failed attempt returns no row and counts for the limit too.
  await db.exec(`update public.profiles set external_metrics_synced_at = now() - interval '1 hour' where id = '${B}'`);
  await db.exec(`delete from public.action_rate_limits`);
  await db.exec(`update test.http_fixtures set status = 503 where method = 'GET'`);
  assert.equal((await as(B, `select * from public.sync_my_research_metrics('${ORCID}')`)).length, 0); ok();
  await assert.rejects(as(B, `select * from public.sync_my_research_metrics('${ORCID}')`), /a moment ago/); ok();
  await db.exec(`update test.http_fixtures set status = 200 where method = 'GET'`);
  await db.exec(`delete from public.action_rate_limits`);

  // Changing the iD in the profile form removes the verification and the old numbers.
  await as(B, `update public.profiles set orcid_id = '0000-0001-5109-3700' where id = '${B}'`);
  const changed = await one(`select orcid_verified_at, external_h_index, external_metrics_synced_at from public.profiles where id = '${B}'`);
  assert.equal(changed.orcid_verified_at, null); assert.equal(changed.external_h_index, 0); assert.equal(changed.external_metrics_synced_at, null); ok();
  // Saving the profile without changing the iD keeps a verification.
  await db.exec(`update public.profiles set orcid_id = '${ORCID}', orcid_verified_at = now() where id = '${B}'`);
  await as(B, `insert into public.profiles (id, email, full_name, orcid_id) values ('${B}','b@x.dev','Bob M','${ORCID}')
               on conflict (id) do update set full_name = excluded.full_name, orcid_id = excluded.orcid_id`);
  assert.ok((await one(`select orcid_verified_at from public.profiles where id = '${B}'`)).orcid_verified_at, 'profile upsert keeps it'); ok();
  await db.exec(`delete from vault.decrypted_secrets`);
});
console.log('ORCID: only the database verifies (secret in Vault), one account per iD, changes reset it, sync follows it');

// ---------------------------------------------------------------- 11. export
await check('export', async () => {
  await as(B, `insert into public.workspace_tasks (workspace_id, title, created_by) values ('${W1}', 'B task', '${B}')`);
  const data = (await as(B, `select public.export_my_data() d`))[0].d;
  assert.equal(data.account.email, 'b@x.dev'); assert.equal(data.profile.id, B); ok();
  assert.ok(data.messages_sent.length >= 2 && data.messages_sent.every((x) => x.conversation_id)); ok();
  assert.ok(data.conversations.some((c) => c.id === chatAB)); ok();
  assert.equal(data.post_reports.length, 1, 'the report on the removed post went with it'); ok();
  assert.equal(data.post_reports[0].status, 'dismissed');
  assert.ok(!('resolved_by' in data.post_reports[0]) && !('resolution_note' in data.post_reports[0]), 'not who handled it'); ok();
  assert.ok(data.stored_files.some((f) => f.bucket === 'chat-attachments')); ok();
  assert.ok(data.workspace_tasks.some((t) => t.title === 'B task')); ok();
  assert.ok(!JSON.stringify(data).includes('secret body'), 'no other people\'s post text'); ok();
  await assert.rejects(as(B, `select public.export_my_data()`), /a moment ago/); ok();
  assert.equal(await auditCount('account.exported'), 1); ok();

  // After leaving a workspace, its tasks (which others keep editing) are not exported.
  const bRow = await one(`select id from public.workspace_members where workspace_id = '${W1}' and user_id = '${B}'`);
  await as(A, `select public.remove_workspace_member('${bRow.id}')`);
  await db.exec(`delete from public.action_rate_limits`);
  const later = (await as(B, `select public.export_my_data() d`))[0].d;
  assert.equal(later.workspace_tasks.length, 0); ok();
  await as(A, `select public.add_workspace_member('${W1}', '${B}')`);
});
console.log('EXPORT: own data only, files listed, rate limited, audited');

// ---------------------------------------------------------------- 12. account deletion
await check('delete account', async () => {
  // C: a post with a file, co-author on A's post, a chat with A, a workspace membership.
  const CP = uid(301);
  await db.exec(`insert into public.contents (id, user_id, title, content) values ('${CP}','${C}','C post','c body')`);
  await db.exec(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('content-files','uploads/${C}/${CP}/a.pdf','${C}','${C}'),
                 ('profile-avatars','${C}/profile-1.png','${C}','${C}')`);
  await db.exec(`insert into public.content_authors (content_id, profile_id, author_order) values ('${P.pub}','${C}',1)`);
  const chatAC = (await as(C, `select public.start_direct_conversation('${A}') id`))[0].id;
  await as(C, `insert into public.messages (conversation_id, sender_id, body) values ('${chatAC}','${C}','bye')`);
  await as(C, `insert into storage.objects (bucket_id, name, owner, owner_id) values ('chat-attachments','${chatAC}/${C}/v.webm','${C}','${C}')`);
  await as(C, `insert into public.messages (conversation_id, sender_id, attachment_path, attachment_name, attachment_kind, attachment_duration_seconds) values ('${chatAC}','${C}','${chatAC}/${C}/v.webm','Voice message','voice',12)`);
  assert.equal((await as(A, `select * from public.my_conversation_summaries() where conversation_id = '${chatAC}'`))[0].last_message_body, 'Voice message'); ok();
  // C leaves the chat; C's own file must still be listed and deletable.
  await as(C, `delete from public.conversation_members where conversation_id = '${chatAC}' and user_id = '${C}'`);
  await as(A, `select public.add_workspace_member('${W1}', '${C}')`);

  const removalsLogged = await auditCount('workspace.member_removed');
  await assert.rejects(as(C, `select public.delete_my_account('delete')`), /Type DELETE/); ok();
  await assert.rejects(as(C, `select public.delete_my_account('DELETE')`), /files could not be deleted/); ok();
  const files = await as(C, `select * from public.my_storage_objects()`);
  assert.deepEqual(files.map((f) => `${f.bucket_id}:${f.name}`).sort(), [`chat-attachments:${chatAC}/${C}/v.webm`, `content-files:uploads/${C}/${CP}/a.pdf`, `profile-avatars:${C}/profile-1.png`]); ok();
  // What the app does through the Storage API: delete each listed file as the user.
  for (const f of files) await as(C, `delete from storage.objects where bucket_id = $1 and name = $2`, [f.bucket_id, f.name]);
  assert.equal((await as(C, `select * from public.my_storage_objects()`)).length, 0, 'own files deletable'); ok();

  await as(C, `select public.delete_my_account('DELETE')`); ok();
  assert.equal(Number((await one(`select count(*) n from auth.users where id = '${C}'`)).n), 0); ok();
  await assert.rejects(as(C, `select public.delete_my_account('DELETE')`), /already deleted/, 'a second call with the old sign-in token'); ok();
  assert.equal(await auditCount('account.deleted'), 1); ok();
  assert.equal(Number((await one(`select count(*) n from public.profiles where id = '${C}'`)).n), 0); ok();
  assert.equal(Number((await one(`select count(*) n from public.contents where user_id = '${C}'`)).n), 0); ok();
  const coauthor = await one(`select profile_id, manual_name from public.content_authors where content_id = '${P.pub}' and manual_name = 'Carol Other'`);
  assert.ok(coauthor && coauthor.profile_id === null, 'co-author entry keeps the name'); ok();
  assert.equal(Number((await one(`select count(*) n from public.conversations where id = '${chatAC}'`)).n), 0); ok();
  assert.equal(Number((await one(`select count(*) n from public.workspace_members where user_id = '${C}'`)).n), 0); ok();
  const del = await one(`select * from public.audit_log where action = 'account.deleted'`);
  assert.equal(del.actor_id, C); assert.equal(del.details.posts, 1); ok();
  assert.equal(await auditCount('workspace.member_removed'), removalsLogged, 'deletion does not log each membership'); ok();

  // A's own workspace files: the owner may delete files others uploaded there.
  await db.exec(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('workspace-files','${W1}/${B}/notes.txt','${B}','${B}')`);
  assert.ok((await as(A, `select * from public.my_storage_objects()`)).some((f) => f.name === `${W1}/${B}/notes.txt`)); ok();
});
console.log('DELETE ACCOUNT: files first (listed + deletable), then everything in one call; co-author names kept');

console.log(`\nALL PHASE 4 CHECKS PASSED: ${passed}`);
