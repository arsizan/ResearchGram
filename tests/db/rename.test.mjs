// 9 Nov 2026: new test for the AcademicOrbit rename migration.
// The AcademicOrbit rename migration on a database that still holds rows with
// the old name: meeting rooms, the name left for deleted authors and the
// default connection-request text. Also: the functions say the new name, keep
// their grants, and the file can run twice.
import assert from 'node:assert/strict';
import { makeDb, applyMigration, asUser, uid, MIGRATIONS } from './harness.mjs';

let passed = 0;
const ok = () => { passed += 1; };

const RENAME = '20261110000000_academicorbit_rename.sql';
assert.equal(MIGRATIONS[MIGRATIONS.length - 1], RENAME);

// The database as it is in production before the rename.
const OLD = 'Research' + 'Gram'; // spelled in two parts so a search for the old name finds only real leftovers
const db = await makeDb({ upTo: MIGRATIONS.indexOf(RENAME) });
const as = asUser(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const [A, B] = [uid(1), uid(2)];
const [W, M1, POST, AUTH_GONE, AUTH_OTHER, REQ_DEFAULT, REQ_OWN] = [uid(601), uid(602), uid(701), uid(702), uid(703), uid(801), uid(802)];
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}','a@x.dev','{"full_name":"Alice"}'), ('${B}','b@x.dev','{"full_name":"Bob"}');
  insert into public.workspaces (id, owner_id, title, workspace_type) values ('${W}','${A}','Lab','shared');
  insert into public.workspace_meetings (id, workspace_id, created_by, title, room_name, meeting_url)
    values ('${M1}','${W}','${A}','Weekly','x','x');
  insert into public.contents (id, user_id, title, content) values ('${POST}','${A}','A post','body');
  insert into public.content_authors (id, content_id, profile_id, manual_name, author_order) values
    ('${AUTH_GONE}','${POST}',null,'Former ${OLD} member',2),
    ('${AUTH_OTHER}','${POST}',null,'Dr. Someone Else',3);
  insert into public.profile_requests (id, requester_id, receiver_id, message) values
    ('${REQ_DEFAULT}','${A}','${B}','I would like to connect with you on ${OLD}.'),
    ('${REQ_OWN}','${B}','${A}','We met at the ${OLD} demo day.');`);

const before = await one(`select room_name, meeting_url from public.workspace_meetings where id = '${M1}'`);
assert.match(before.room_name, new RegExp(`^${OLD}-[0-9a-f]{32}$`), 'production rooms have the old start'); ok();
const hex = before.room_name.slice(OLD.length + 1);

await applyMigration(db, RENAME);
console.log('MIGRATION: applied over rows with the old name'); ok();

// Rows
const room = await one(`select room_name, meeting_url from public.workspace_meetings where id = '${M1}'`);
assert.equal(room.room_name, `AcademicOrbit-${hex}`, 'same random part, new start'); ok();
assert.equal(room.meeting_url, `https://meet.jit.si/AcademicOrbit-${hex}`); ok();
const authors = Object.fromEntries((await q(`select id, manual_name from public.content_authors where content_id = '${POST}'`)).map((r) => [r.id, r.manual_name]));
assert.equal(authors[AUTH_GONE], 'Former AcademicOrbit member'); ok();
assert.equal(authors[AUTH_OTHER], 'Dr. Someone Else', 'other names untouched'); ok();
const requests = Object.fromEntries((await q(`select id, message from public.profile_requests`)).map((r) => [r.id, r.message]));
assert.equal(requests[REQ_DEFAULT], 'I would like to connect with you on AcademicOrbit.'); ok();
assert.equal(requests[REQ_OWN], `We met at the ${OLD} demo day.`, 'what a member wrote is not changed'); ok();
console.log('ROWS: meeting room, deleted-author name and default request text renamed; members\' own words kept');

// Functions
const leftovers = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc ~* 'research[ _-]?gram'`);
assert.deepEqual(leftovers, [], 'no function in public still says the old name'); ok();
const fresh = await one(`insert into public.workspace_meetings (workspace_id, created_by, title, room_name, meeting_url)
  values ('${W}','${A}','New','x','x') returning room_name, meeting_url`);
assert.match(fresh.room_name, /^AcademicOrbit-[0-9a-f]{32}$/); assert.equal(fresh.meeting_url, `https://meet.jit.si/${fresh.room_name}`); ok();
const version = (await one(`select public.current_terms_version() v`)).v;
await assert.rejects(as(A, `select public.accept_terms($1, false)`, [version]), /AcademicOrbit is for people aged 18 or older/); ok();
assert.equal((await as(A, `select public.export_my_data() d`))[0].d.format, 'academicorbit-export-1'); ok();
const source = async (fn) => (await one(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn])).prosrc;
assert.match(await source('delete_my_account'), /'Former AcademicOrbit member'/); ok();
assert.match(await source('delete_my_account'), /Please contact the AcademicOrbit team/); ok();
assert.match(await source('verify_orcid'), /already verified on another AcademicOrbit account/); ok();
assert.match(await source('verify_orcid'), /^#variable_conflict use_column/m, 'body copied whole'); ok();
console.log('FUNCTIONS: new rooms, age message, export format, deletion and ORCID texts use the new name');

// Grants are what they were.
const can = async (role, fn) => (await one(`select has_function_privilege($1, $2, 'execute') x`, [role, fn])).x;
for (const fn of ['public.export_my_data()', 'public.delete_my_account(text)', 'public.verify_orcid(text, text)', 'public.accept_terms(text, boolean)']) {
  assert.equal(await can('anon', fn), false, `${fn}: anon`); ok();
  assert.equal(await can('authenticated', fn), true, `${fn}: authenticated`); ok();
}
assert.equal(await can('authenticated', 'public.workspace_meetings_random_room()'), false); ok();
assert.equal(await can('anon', 'public.workspace_meetings_random_room()'), false); ok();
console.log('GRANTS: unchanged (signed-in members only; the room trigger function is not callable)');

// Running the file again changes nothing.
await applyMigration(db, RENAME);
assert.deepEqual(await one(`select room_name, meeting_url from public.workspace_meetings where id = '${M1}'`), room); ok();
assert.equal((await one(`select manual_name from public.content_authors where id = '${AUTH_GONE}'`)).manual_name, 'Former AcademicOrbit member'); ok();
assert.equal((await one(`select message from public.profile_requests where id = '${REQ_DEFAULT}'`)).message, 'I would like to connect with you on AcademicOrbit.'); ok();
console.log('RERUN: second run keeps everything as it is');

// Run before Phase 5, the file stops at its first statement and changes nothing.
const early = await makeDb({ upTo: MIGRATIONS.indexOf('20261017000000_phase5.sql') });
await assert.rejects(applyMigration(early, RENAME), /Run supabase\/migrations\/20261017000000_phase5\.sql first/); ok();
const earlyRoom = (await early.query(`select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'workspace_meetings_random_room'`)).rows[0].prosrc;
assert.ok(earlyRoom.includes(`'${OLD}-'`), 'nothing was changed'); ok();
console.log('ORDER: before Phase 5 the file refuses to run and leaves the database as it was');

console.log(`\nALL RENAME CHECKS PASSED: ${passed}`);
