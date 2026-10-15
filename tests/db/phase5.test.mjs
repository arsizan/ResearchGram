// Phase 5 migration test: faster row checks (same rules), split post-file
// rules, better search (finds everything the old search found, plus word
// order, word endings and name typos; privacy unchanged; indexes used),
// Terms consent, error log, export.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb, applyMigration, asUser, uid, MIGRATIONS } from './harness.mjs';

let passed = 0;
const ok = () => { passed += 1; };
const check = async (label, fn) => {
  try { await fn(); } catch (e) { console.error(`FAILED: ${label}`); throw e; }
};

const PHASE5 = '20261017000000_phase5.sql';
assert.equal(MIGRATIONS[MIGRATIONS.length - 1], PHASE5);

// ---------------------------------------------------------------- 0. same row rules, written the fast way
const policies = async (db) => Object.fromEntries((await db.query(
  `select tablename || ' / ' || policyname as k, cmd, roles::text as roles, permissive, qual, with_check
   from pg_policies where schemaname = 'public'`)).rows.map((r) => [r.k, r]));

const before = await makeDb({ upTo: MIGRATIONS.indexOf(PHASE5) });
const oldRules = await policies(before);
await applyMigration(before, PHASE5);
await applyMigration(before, PHASE5); // safe to run twice
const newRules = await policies(before);
await before.close();

await check('row rules', async () => {
  const slow = /auth\.uid\(\)/;
  const fast = /\( SELECT auth\.uid\(\) AS uid\)/g;
  let rewritten = 0;
  for (const [key, old] of Object.entries(oldRules)) {
    if (/post author writes$/.test(key)) continue; // split below
    const now = newRules[key];
    assert.ok(now, `${key} still exists`);
    assert.equal(now.cmd, old.cmd, `${key}: same command`);
    assert.equal(now.roles, old.roles, `${key}: same roles`);
    assert.equal(now.permissive, old.permissive);
    for (const part of ['qual', 'with_check']) {
      const a = old[part], b = now[part];
      if (a === null) { assert.equal(b, null, `${key} ${part}`); continue; }
      // Same rule once "(select auth.uid())" is written as "auth.uid()".
      assert.equal(b.replace(fast, 'auth.uid()'), a.replace(fast, 'auth.uid()'), `${key} ${part}: same rule`);
      if (a !== b) rewritten += 1;
      assert.ok(!slow.test(b.replace(fast, '')), `${key} ${part}: auth.uid() read once per query`);
    }
  }
  assert.ok(rewritten >= 27, `rewritten ${rewritten}`); ok();
  for (const t of ['attachments', 'extracted images']) {
    assert.ok(!newRules[`${t === 'attachments' ? 'content_attachments' : 'paper_extracted_images'} / ${t}: post author writes`]);
  }
  const split = Object.keys(newRules).filter((k) => /post author (adds|changes|removes)$/.test(k));
  assert.equal(split.length, 6); ok();
  assert.deepEqual(split.map((k) => newRules[k].cmd).sort(), ['DELETE', 'DELETE', 'INSERT', 'INSERT', 'UPDATE', 'UPDATE']); ok();
  const add = newRules['content_attachments / attachments: post author adds'];
  const writes = oldRules['content_attachments / attachments: post author writes'];
  assert.equal(add.with_check, writes.with_check, 'adding keeps the folder and bucket checks'); ok();
});

await check('a rule that differs stops the whole file', async () => {
  const other = await makeDb({ upTo: MIGRATIONS.indexOf(PHASE5) });
  await other.exec(`alter policy "users can read own notifications" on public.notifications using (recipient_id = auth.uid() or false)`);
  await assert.rejects(applyMigration(other, PHASE5), /Phase 5 stopped and changed nothing/); ok();
  assert.equal((await other.query(`select to_regclass('public.user_consents')::text t`)).rows[0].t, null, 'nothing was applied'); ok();
  assert.match((await other.query(`select qual from pg_policies where policyname = 'users can read own notifications'`)).rows[0].qual,
    /OR false/, 'the rule is as it was'); ok();
  await other.close();
});
console.log('ROW RULES: every rule unchanged except reading the user once; post-file rules split by action; a rule that differs stops everything');

const db = await makeDb();
const as = asUser(db);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const [A, B, C, D] = [uid(1), uid(2), uid(3), uid(4)];
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}','a@x.dev','{"full_name":"Alice Admin","department":"CSE"}'),
  ('${B}','b@x.dev','{"full_name":"Md Abdur Rahman","department":"CSE"}'),
  ('${C}','c@x.dev','{"full_name":"Carol Chowdhury","department":"EEE"}'),
  ('${D}','d@x.dev','{"full_name":"Dan Stranger"}');
  insert into public.admins (user_id) values ('${A}');`);

// ---------------------------------------------------------------- 1. foreign keys have indexes
await check('indexes', async () => {
  const missing = await q(`
    select cl.relname as t, c.conname
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indisvalid
                      and (string_to_array(i.indkey::text, ' ')::smallint[])[1:array_length(c.conkey, 1)] = c.conkey)`);
  assert.deepEqual(missing, [], 'every foreign key has an index'); ok();
});
console.log('INDEXES: every foreign key in public has an index');

// ---------------------------------------------------------------- 2. post files: author rules split, same effect
await check('post files', async () => {
  const P = uid(100), PRIV = uid(101);
  await db.exec(`insert into public.contents (id, user_id, title, content, visibility_mode) values
    ('${P}','${B}','B public','b text','public'), ('${PRIV}','${B}','B private','secret','private')`);
  const path = (post) => `uploads/${B}/${post}/f.pdf`;
  const insertFile = `insert into public.content_attachments (content_id, file_url, original_name, storage_path, attachment_type, bucket_name)
                      values ($1, '', 'f.pdf', $2, 'document', 'content-files')`;
  await as(B, insertFile, [P, path(P)]);
  await as(B, insertFile, [PRIV, path(PRIV)]); ok();
  await assert.rejects(as(B, insertFile, [P, `uploads/${C}/${P}/x.pdf`]), /row-level security/, 'not from another folder'); ok();
  await assert.rejects(as(C, insertFile, [P, `uploads/${C}/${P}/x.pdf`]), /row-level security/, 'not on someone else\'s post'); ok();
  assert.equal((await as(B, `select count(*)::int n from public.content_attachments where content_id in ($1,$2)`, [P, PRIV]))[0].n, 2, 'author reads both'); ok();
  assert.equal((await as(C, `select count(*)::int n from public.content_attachments where content_id in ($1,$2)`, [P, PRIV]))[0].n, 1, 'others: public post only'); ok();
  assert.equal((await as(C, `update public.content_attachments set original_name = 'hacked' where content_id = $1 returning id`, [P])).length, 0); ok();
  assert.equal((await as(C, `delete from public.content_attachments where content_id = $1 returning id`, [P])).length, 0); ok();
  assert.equal((await as(B, `update public.content_attachments set original_name = 'renamed.pdf' where content_id = $1 returning id`, [P])).length, 1); ok();
  await assert.rejects(as(B, `update public.content_attachments set storage_path = $2 where content_id = $1`, [P, `uploads/${C}/${P}/f.pdf`]),
    /row-level security/, 'cannot point at another folder'); ok();
  assert.equal((await as(B, `delete from public.content_attachments where content_id = $1 returning id`, [PRIV])).length, 1); ok();
  await as(B, `insert into public.paper_extracted_images (content_id, image_url, storage_path) values ($1, 'https://x.dev/fig.png', 'fig.png')`, [P]); ok();
  await assert.rejects(as(C, `insert into public.paper_extracted_images (content_id, image_url, storage_path) values ($1, 'https://x.dev/x.png', 'x.png')`, [P]), /row-level security/); ok();
  assert.equal((await as(C, `select count(*)::int n from public.paper_extracted_images where content_id = $1`, [P]))[0].n, 1); ok();
  assert.equal((await as(B, `delete from public.paper_extracted_images where content_id = $1 returning id`, [P])).length, 1); ok();
  await db.exec(`delete from public.contents where id in ('${P}','${PRIV}')`);
});
console.log('POST FILES: authors add, change and remove their own; others read public posts only');

// ---------------------------------------------------------------- 3. search
// The Phase 3 versions, kept here to prove nothing they found is lost.
{
  const phase3 = readFileSync(new URL('../../supabase/migrations/20261015000000_phase3_server_side.sql', import.meta.url), 'utf8');
  for (const name of ['search_researchers', 'search_posts']) {
    const start = phase3.indexOf(`create or replace function public.${name}(`);
    const end = phase3.indexOf('$$;', phase3.indexOf('as $$', start)) + 3;
    await db.exec(phase3.slice(start, end).replace(`public.${name}(`, `test.old_${name}(`));
  }
  await db.exec(`grant usage on schema test to authenticated; grant execute on all functions in schema test to authenticated;`);
}

let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const vocab = ['AI', 'machine-learning', 'NLP', 'deep learning', 'Java', 'C++', 'data/science', 'robotics', 'IoT', 'networks',
  'cloud_computing', 'the', 'study', 'studies', 'Research', 'vision', 'graph', 'বাংলা', 'security', 'web,dev', 'bio-informatics',
  'a', 'é-learning', 'medical imaging', 'learning deep'];
const sentence = (n) => Array.from({ length: n }, () => pick(vocab)).join(pick([' ', ', ', '; ', ' - ']));
for (let i = 10; i < 60; i++) {
  const id = uid(i);
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `p${i}@x.dev`]);
  await db.query(`update public.profiles set full_name=$2, department=$3, skills=$4, interests=$5, bio=$6, research_area=$7,
    profile_completion_score=$8 where id=$1`, [id, rnd() < 0.9 ? `Person ${sentence(1)} ${i}` : null, pick(['CSE', 'EEE', null]),
    rnd() < 0.8 ? sentence(2) : null, rnd() < 0.7 ? sentence(2) : null, rnd() < 0.5 ? sentence(5) : null,
    rnd() < 0.4 ? sentence(2) : null, Math.floor(rnd() * 100)]);
}
const owners = [A, B, C, uid(12)];
const posts = [];
for (let i = 0; i < 60; i++) {
  const row = { id: uid(500 + i), user_id: pick(owners), title: rnd() < 0.9 ? `Title ${sentence(2)}` : null, content: sentence(8),
    abstract: rnd() < 0.5 ? sentence(3) : null, keywords: rnd() < 0.6 ? sentence(2) : null,
    post_type: pick(['research_note', 'dataset']), content_category: pick(['general_post', 'research_paper']),
    vis: pick(['public', 'public', 'abstract_only', 'private']) };
  posts.push(row);
  await db.query(`insert into public.contents (id, user_id, title, content, abstract, keywords, post_type, content_category, visibility_mode, created_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - ($10 || ' minutes')::interval)`,
    [row.id, row.user_id, row.title, row.content, row.abstract, row.keywords, row.post_type, row.content_category, row.vis, String(i)]);
}
await db.query(`insert into public.hidden_posts (user_id, content_id) values ($1, $2)`, [B, posts[2].id]);

await check('search: nothing lost', async () => {
  for (const s of ['ai', 'learning', 'deep learning', 'title', 'dataset', 'research paper', 'web dev', 'c++', 'বাংলা', 'é', 'the',
    'cloud_computing', 'zzz', ' ', 'person', 'cse', 'p1', 'x.dev', 'data science']) {
    for (const who of [B, C]) {
      const oldP = (await as(who, `select id from test.old_search_researchers($1, 100)`, [s])).map((r) => r.id);
      const newP = (await as(who, `select id from public.search_researchers($1, 100)`, [s])).map((r) => r.id);
      assert.ok(oldP.every((id) => newP.includes(id)), `researchers "${s}": everything the old search found`);
      const oldT = await as(who, `select id, content from test.old_search_posts($1, 100)`, [s]);
      const newT = await as(who, `select id, content from public.search_posts($1, 100)`, [s]);
      assert.ok(oldT.every((r) => newT.some((x) => x.id === r.id)), `posts "${s}": everything the old search found`);
      // The text comes back exactly when the old search returned it.
      for (const r of newT) {
        const readable = await db.transaction(async (tx) => {
          await tx.exec(`set local request.jwt.claim.sub = '${who}';`);
          return (await tx.query(`select public.can_read_post_text(user_id, visibility_mode, id) r from public.contents where id = $1`, [r.id])).rows[0].r;
        });
        assert.equal(r.content === null, !readable, 'text only when readable');
      }
    }
    ok();
  }
});

await check('search: better matches', async () => {
  const P1 = uid(900), P2 = uid(901), P3 = uid(902), P4 = uid(903), P5 = uid(904);
  await db.exec(`insert into public.contents (id, user_id, title, abstract, keywords, content, visibility_mode, created_at) values
    ('${P1}','${C}','Medical imaging with deep learning', null, 'radiology', 'body one', 'public', now() - interval '3 days'),
    ('${P2}','${C}','Graph networks for traffic', 'We study bioinformatics pipelines', null, 'body two', 'public', now() - interval '2 days'),
    ('${P3}','${C}','Abstract only paper', 'short abstract', null, 'the hidden quantumword is here', 'abstract_only', now() - interval '1 day'),
    ('${P4}','${C}','My private notes', null, null, 'private zebraword', 'private', now()),
    ('${P5}','${C}','Deep learning survey', null, null, 'deep learning deep learning', 'public', now() - interval '5 days')`);
  const ids = async (who, s) => (await as(who, `select id from public.search_posts($1, 100)`, [s])).map((r) => r.id);
  assert.ok((await ids(B, 'learning deep imaging')).includes(P1), 'words in any order'); ok();
  assert.ok((await ids(B, 'network')).includes(P2), 'word endings: network -> networks'); ok();
  assert.ok((await ids(B, 'bioinf')).includes(P2), 'start of a word: bioinf -> bioinformatics'); ok();
  assert.ok((await ids(B, 'studies')).includes(P2), 'studies -> study'); ok();
  assert.ok(!(await ids(B, 'quantumword')).includes(P3), 'text of an abstract-only post is not searched without access'); ok();
  assert.ok(!(await ids(B, 'zebraword')).includes(P4), 'someone else\'s private post is never found'); ok();
  assert.ok((await ids(C, 'zebraword')).includes(P4), 'own private post is found'); ok();
  await db.exec(`insert into public.paper_access_requests (content_id, requester_id, owner_id, status) values ('${P3}','${B}','${C}','approved')`);
  const got = await as(B, `select id, content from public.search_posts('quantumword', 10)`);
  assert.equal(got.length, 1); assert.equal(got[0].id, P3); assert.match(got[0].content, /quantumword/, 'after approval: found, with its text'); ok();
  assert.ok((await ids(B, 'deep learning')).includes(P5)); ok();
  // Ranking: the typed text itself first (title before keywords), then posts
  // that only have the words, newest last among equals.
  const [R1, R2, R3] = [uid(910), uid(911), uid(912)];
  await db.exec(`insert into public.contents (id, user_id, title, keywords, content, visibility_mode, created_at) values
    ('${R3}','${C}','Notes', null, 'a telescope pointed at a distant quasar', 'public', now()),
    ('${R2}','${C}','Survey', 'quasar telescope', 'body', 'public', now() - interval '1 day'),
    ('${R1}','${C}','Quasar telescope arrays', null, 'body', 'public', now() - interval '2 days')`);
  assert.deepEqual(await ids(B, 'quasar telescope'), [R1, R2, R3], 'phrase in title, phrase in keywords, then words only'); ok();
  await db.exec(`delete from public.contents where id in ('${R1}','${R2}','${R3}')`);
  // Only stop words: there is no word query, so exactly the old rule applies.
  assert.deepEqual((await ids(B, 'the')).sort(),
    (await as(B, `select id from test.old_search_posts('the', 100)`)).map((r) => r.id).sort(), 'stop words: same as before'); ok();
  await db.exec(`delete from public.paper_access_requests where content_id = '${P3}';
                 delete from public.contents where id in ('${P1}','${P2}','${P3}','${P4}','${P5}')`);

  // Words spread over the title and the text: found when the text may be read.
  const [X1, X2] = [uid(920), uid(921)];
  await db.exec(`insert into public.contents (id, user_id, title, content, visibility_mode) values
    ('${X1}','${C}','Notes on alphaword','betaword gamma','public'),
    ('${X2}','${C}','Notes on alphaword','betaword gamma','abstract_only')`);
  const cross = await ids(B, 'alphaword betaword');
  assert.ok(cross.includes(X1), 'a title word and a text word'); ok();
  assert.ok(!cross.includes(X2), 'not when the text may not be read'); ok();
  assert.ok((await ids(C, 'alphaword betaword')).includes(X2), 'the author finds their own'); ok();
  await db.exec(`delete from public.contents where id in ('${X1}','${X2}')`);

  const people = async (who, s) => (await as(who, `select id, full_name from public.search_researchers($1, 100)`, [s]));
  assert.ok((await people(C, 'rahmn')).some((p) => p.id === B), 'name with a typo'); ok();
  assert.ok((await people(C, 'abdur rahman')).some((p) => p.id === B)); ok();
  assert.ok(!(await people(B, 'rahman')).some((p) => p.id === B), 'never yourself'); ok();
  const carol = await people(B, 'carol');
  assert.equal(carol[0].id, C, 'a name that starts with the search comes first'); ok();
  assert.equal((await people(B, 'zz')).length, 0, 'short nonsense finds nothing'); ok();
  assert.equal((await as(B, `select id from public.search_researchers('person', 1000)`)).length <= 100, true, 'capped at 100'); ok();
});

await check('search: privacy and limits', async () => {
  await assert.rejects(as(null, `select * from public.search_posts('ai', 5)`), /permission denied/); ok();
  await assert.rejects(as(null, `select * from public.search_researchers('ai', 5)`), /permission denied/); ok();
  assert.ok(!(await as(B, `select id from public.search_posts('title', 100)`)).some((r) => r.id === posts[2].id), 'hidden post left out'); ok();
  const priv = posts.filter((p) => p.vis === 'private' && p.user_id !== B).map((p) => p.id);
  for (const s of ['title', 'learning', 'research']) {
    const got = (await as(B, `select id from public.search_posts($1, 100)`, [s])).map((r) => r.id);
    assert.ok(got.every((id) => !priv.includes(id)), 'other people\'s private posts never'); ok();
  }
  assert.equal((await as(B, `select id from public.search_posts('title', 3)`)).length, 3); ok();
  assert.equal((await as(B, `select id from public.search_posts('', 3)`)).length, 0); ok();
  assert.equal(await one(`select public.rg_tsquery('the a') q`).then((r) => r.q), null, 'only stop words: no word query'); ok();
  assert.equal((await one(`select public.rg_tsquery('Bio-informatics & | ! :*') q`)).q, `'bio':* & 'informat':*`, 'operators cannot be injected'); ok();
});

await check('search: long searches and very long posts', async () => {
  // Longer than a word index can hold (over 1 MB of different words): still saves, still found.
  const BIG = uid(930);
  const huge = 'zetaword ' + Array.from({ length: 200000 }, (_, i) => `t${i}`).join(' ');
  await db.query(`insert into public.contents (id, user_id, title, content, visibility_mode) values ($1, $2, 'Huge', $3, 'public')`, [BIG, C, huge]);
  ok();
  assert.ok((await as(B, `select id from public.search_posts('zetaword', 10)`)).some((r) => r.id === BIG), 'found by a word'); ok();
  assert.ok((await as(B, `select id from public.search_posts('t199999', 10)`)).some((r) => r.id === BIG), 'found by text near the end'); ok();
  await db.query(`update public.profiles set bio = $2 where id = $1`, [C, huge]);
  ok();
  await db.query(`update public.profiles set bio = null where id = $1`, [C]);
  await db.query(`delete from public.contents where id = $1`, [BIG]);
  // Only the first 200 characters of a search count.
  const long = 'deep learning ' + 'x'.repeat(5000);
  const cut = long.slice(0, 200);
  assert.deepEqual((await as(B, `select id from public.search_posts($1, 100)`, [long])).map((r) => r.id),
    (await as(B, `select id from public.search_posts($1, 100)`, [cut])).map((r) => r.id)); ok();
  assert.deepEqual((await as(B, `select id from public.search_researchers($1, 100)`, [long])).map((r) => r.id),
    (await as(B, `select id from public.search_researchers($1, 100)`, [cut])).map((r) => r.id)); ok();
});

await check('search: indexes', async () => {
  await db.exec(`analyze;`);
  const plan = async (sql) => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec(`set local enable_seqscan = off;`);
      return (await tx.query(`explain ${sql}`)).rows;
    });
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  };
  const postWhere = `((public.rg_post_document(c.title, c.abstract, c.keywords, c.post_type, c.content_category)
        || public.rg_post_text_document(c.content)) @@ public.rg_tsquery('deep learning')
     or public.rg_post_fields(c.title, c.abstract, c.keywords, c.post_type, c.content_category) like public.rg_like_pattern('deep learning')
     or public.rg_post_text(c.content) like public.rg_like_pattern('deep learning'))`;
  const postIndexes = ['contents_search_words_idx', 'contents_search_fields_trgm_idx', 'contents_search_text_trgm_idx'];
  const p = await plan(`select c.id from public.contents c where ${postWhere}`);
  for (const index of postIndexes) {
    assert.ok(p.includes(index), `posts use ${index}\n${p}`);
  }
  assert.match(p, /BitmapOr/); ok();
  // Without forcing it: with a few hundred posts Postgres picks the indexes by itself.
  await db.exec(`insert into public.contents (id, user_id, title, content, visibility_mode)
                 select gen_random_uuid(), '${C}', 'Filler ' || g, repeat('filler text ' || g || ' ', 50), 'public'
                 from generate_series(1, 300) g; analyze public.contents;`);
  const natural = (await db.query(`explain select c.id from public.contents c where ${postWhere}`)).rows.map((r) => r['QUERY PLAN']).join('\n');
  await db.exec(`delete from public.contents where title like 'Filler %'; analyze public.contents;`);
  for (const index of postIndexes) {
    assert.ok(natural.includes(index), `posts use ${index} unforced\n${natural}`);
  }
  ok();
  const r = await plan(`select p.id from public.profiles p where
      public.rg_profile_fields(p.full_name, p.email, p.department, p.skills, p.interests, p.user_role, p.academic_level, p.batch, p.session,
        p.current_position, p.company_or_institution, p.research_area, p.expertise, p.bio) like public.rg_like_pattern('rahman')
      or public.rg_profile_document(p.full_name, p.skills, p.interests, p.research_area, p.expertise, p.department, p.user_role,
        p.academic_level, p.current_position, p.company_or_institution, p.bio) @@ public.rg_tsquery('rahman')
      or 'rahman' operator(extensions.<%) lower(coalesce(p.full_name, ''))`);
  for (const index of ['profiles_search_fields_trgm_idx', 'profiles_search_document_idx', 'profiles_name_trgm_idx']) {
    assert.ok(r.includes(index), `people use ${index}\n${r}`);
  }
  ok();
  const peopleWhere = `public.rg_profile_fields(p.full_name, p.email, p.department, p.skills, p.interests, p.user_role, p.academic_level, p.batch, p.session,
        p.current_position, p.company_or_institution, p.research_area, p.expertise, p.bio) like public.rg_like_pattern('rahman')
      or public.rg_profile_document(p.full_name, p.skills, p.interests, p.research_area, p.expertise, p.department, p.user_role,
        p.academic_level, p.current_position, p.company_or_institution, p.bio) @@ public.rg_tsquery('rahman')
      or 'rahman' operator(extensions.<%) lower(coalesce(p.full_name, ''))`;
  const naturalPeople = (await db.query(`explain select p.id from public.profiles p where ${peopleWhere}`)).rows.map((x) => x['QUERY PLAN']).join('\n');
  assert.match(naturalPeople, /profiles_search_document_idx/, `people: indexes unforced\n${naturalPeople}`); ok();
});
console.log('SEARCH: finds what the old search found, plus any word order, words across title and text, word endings and name typos; privacy kept; long input and long posts safe; indexes used');

// ---------------------------------------------------------------- 4. Terms consent
await check('consent', async () => {
  const appVersion = readFileSync(new URL('../../lib/legal.ts', import.meta.url), 'utf8').match(/TERMS_VERSION = "([0-9-]+)"/)[1];
  assert.equal((await one(`select public.current_terms_version() v`)).v, appVersion, 'database and app agree on the version'); ok();
  const [N1, N2, N3] = [uid(70), uid(71), uid(72)];
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'n1@x.dev', jsonb_build_object('full_name', 'New One', 'terms_version', $4::text, 'age_confirmed', true)),
    ($2, 'n2@x.dev', jsonb_build_object('full_name', 'New Two', 'terms_version', $4::text)),
    ($3, 'n3@x.dev', jsonb_build_object('full_name', 'New Three', 'terms_version', '2020-01-01', 'age_confirmed', true))`, [N1, N2, N3, appVersion]);
  assert.equal((await one(`select terms_version from public.user_consents where user_id = $1`, [N1])).terms_version, appVersion, 'sign-up with consent'); ok();
  assert.equal((await q(`select 1 from public.user_consents where user_id in ($1, $2)`, [N2, N3])).length, 0, 'no age or old version: nothing stored'); ok();
  assert.equal((await one(`select full_name from public.profiles where id = $1`, [N1])).full_name, 'New One', 'profile still made'); ok();

  assert.equal((await one(`select age_confirmed from public.user_consents where user_id = $1`, [N1])).age_confirmed, true, 'age confirmed at sign-up'); ok();
  await assert.rejects(as(N2, `select public.accept_terms('2020-01-01', true)`), /Terms were updated/); ok();
  await assert.rejects(as(N2, `select public.accept_terms($1)`, [appVersion]), /18 or older/, 'age must be confirmed'); ok();
  await assert.rejects(as(N2, `select public.accept_terms($1, false)`, [appVersion]), /18 or older/); ok();
  const at = (await as(N2, `select public.accept_terms($1, true) at`, [appVersion]))[0].at;
  assert.ok(at); ok();
  assert.equal((await one(`select age_confirmed from public.user_consents where user_id = $1`, [N2])).age_confirmed, true); ok();
  assert.equal((await as(N2, `select terms_version from public.user_consents`)).length, 1, 'reads own'); ok();
  assert.equal((await as(N2, `select * from public.user_consents where user_id = $1`, [N1])).length, 0, 'not other people\'s'); ok();
  await assert.rejects(as(N2, `insert into public.user_consents (user_id, terms_version) values ($1, $2)`, [N3, appVersion]), /permission denied/); ok();
  await assert.rejects(as(N2, `update public.user_consents set accepted_at = now() - interval '1 year'`), /permission denied/); ok();
  await assert.rejects(as(null, `select public.accept_terms($1)`, [appVersion]), /permission denied/); ok();
  await assert.rejects(as(null, `select * from public.user_consents`), /permission denied/); ok();
  await db.exec(`delete from public.action_rate_limits`);
  const exported = (await as(N2, `select public.export_my_data() d`))[0].d;
  assert.equal(exported.consent.terms_version, appVersion, 'export includes consent'); ok();
  assert.equal(exported.consent.age_confirmed, true); ok();
  assert.equal((await as(N2, `select public.delete_my_account('DELETE')`)).length, 1);
  assert.equal((await q(`select 1 from public.user_consents where user_id = $1`, [N2])).length, 0, 'gone with the account'); ok();
});
console.log('CONSENT: stored at sign-up with the age confirmation, accepted later by older accounts, private, exported, deleted with the account');

// ---------------------------------------------------------------- 5. error log
await check('error log', async () => {
  const report = (who, args) => as(who, `select public.report_error($1, $2, $3, $4, $5, $6)`, args);
  const reset = () => db.exec(`delete from public.action_rate_limits`);
  await report(null, ['browser', 'TypeError: x is undefined', 'at a (app.js:1:2)', '/auth/login?next=/feed&code=SECRET#frag', null, 'Mozilla/5.0']);
  let rows = await q(`select * from public.error_reports`);
  assert.equal(rows.length, 1); assert.equal(rows[0].path, '/auth/login', 'no query or fragment'); assert.equal(rows[0].signed_in, false); ok();
  await report(null, ['browser', 'TypeError: x is undefined', 'other stack', '/auth/login?x=2', null, null]);
  rows = await q(`select * from public.error_reports`);
  assert.equal(rows.length, 1); assert.equal(rows[0].occurrences, 2, 'same error, same page: counted'); ok();
  await report(B, ['browser', 'TypeError: x is undefined', null, '/auth/login', null, null]);
  rows = await q(`select * from public.error_reports`);
  assert.equal(rows[0].occurrences, 3); assert.equal(rows[0].signed_in, true); ok();
  await report(B, ['browser', 'Another error', null, '/feed', null, null]);
  assert.equal((await q(`select 1 from public.error_reports`)).length, 1, 'one report a second per person'); ok();
  await reset();
  await report(B, ['server', 'Line one\nline two\u0007', null, 'https://evil.dev/x', 'digest-1', null]);
  const server = await one(`select * from public.error_reports where source = 'server'`);
  assert.equal(server.message, 'Line one line two', 'control characters removed'); assert.equal(server.path, null, 'only paths on this site'); ok();
  for (const bad of [['other', 'x'], ['browser', ''], ['browser', '   '], [null, 'x']]) {
    await report(null, [bad[0], bad[1], null, '/x', null, null]);
  }
  assert.equal((await q(`select 1 from public.error_reports`)).length, 2, 'bad reports ignored'); ok();

  // Short texts, whatever is sent.
  await report(null, ['browser', 'y'.repeat(5000), 's'.repeat(9000), '/' + 'p'.repeat(900), 'd'.repeat(300), 'u'.repeat(900)]);
  const long = await one(`select * from public.error_reports where message like 'yyy%'`);
  assert.equal(long.message.length, 300); assert.equal(long.stack.length, 2000); assert.equal(long.path.length, 200);
  assert.equal(long.digest.length, 64); assert.equal(long.user_agent.length, 300); ok();

  // Personal details are blanked out, and the same bug on different people's pages is one row.
  const id1 = uid(4001), id2 = uid(4002);
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';
  await report(null, ['browser', `Profile ${id1} of rahman.sizan@gmail.com failed with ${jwt}`,
    `at load (https://research-gram.vercel.app/_next/static/chunks/a.js?dpl=dpl_123:1:2)\nat /auth/reset-password?token_hash=abc&type=recovery`,
    `/researchers/${id1}`, null, null]);
  await report(null, ['browser', `Profile ${id2} of other.person@uni.ac.bd failed with ${jwt}x`, null, `/researchers/${id2}`, null, null]);
  const scrubbed = await q(`select * from public.error_reports where message like 'Profile%'`);
  assert.equal(scrubbed.length, 1, 'one row for both'); assert.equal(scrubbed[0].occurrences, 2); ok();
  assert.equal(scrubbed[0].message, 'Profile :id of [email] failed with [token]'); ok();
  assert.equal(scrubbed[0].path, '/researchers/:id'); ok();
  assert.ok(!/dpl_123|token_hash|abc/.test(scrubbed[0].stack) && /a\.js:1:2/.test(scrubbed[0].stack), `stack without query strings: ${scrubbed[0].stack}`); ok();

  // A flood from people who are not signed in: 100 new kinds an hour; signed-in reports still get through.
  await db.exec(`insert into public.error_reports (fingerprint, source, message)
                 select md5('f' || g), 'browser', 'flood ' || g from generate_series(1, 97) g`);
  assert.equal((await one(`select count(*)::int n from public.error_reports where first_seen > now() - interval '1 hour' and not signed_in`)).n, 99); ok();
  await report(null, ['browser', 'flood extra', null, '/x', null, null]);
  await report(null, ['browser', 'flood too many', null, '/x', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'flood extra'`)).length, 1); ok();
  assert.equal((await q(`select 1 from public.error_reports where message = 'flood too many'`)).length, 0, 'signed out: capped'); ok();
  await reset();
  await report(B, ['browser', 'signed in still counts', null, '/x', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'signed in still counts'`)).length, 1); ok();
  await report(null, ['browser', 'TypeError: x is undefined', null, '/auth/login', null, null]);
  assert.equal((await one(`select occurrences from public.error_reports where message = 'TypeError: x is undefined'`)).occurrences, 4, 'known errors still counted'); ok();
  // 200 new kinds an hour in all.
  await db.exec(`insert into public.error_reports (fingerprint, source, message, signed_in)
                 select md5('s' || g), 'browser', 'flood signed in ' || g, true from generate_series(1, 99) g`);
  await reset();
  await report(B, ['browser', 'flood over 200', null, '/x', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'flood over 200'`)).length, 0, 'everyone: capped at 200 an hour'); ok();
  // At most 2,000 rows from people who are not signed in, 2,500 in all.
  await db.exec(`update public.error_reports set first_seen = now() - interval '2 hours' where message like 'flood%';
                 insert into public.error_reports (fingerprint, source, message, first_seen)
                 select md5('o' || g), 'browser', 'flood old ' || g, now() - interval '2 hours'
                 from generate_series(1, 2000 - (select count(*) from public.error_reports)) g`);
  await report(null, ['browser', 'flood row 2001', null, '/x', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'flood row 2001'`)).length, 0, 'signed out: 2,000 rows'); ok();
  await reset();
  await report(B, ['browser', 'flood signed in row 2001', null, '/x', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'flood signed in row 2001'`)).length, 1, 'signed in: room left'); ok();
  await db.exec(`delete from public.error_reports where message like 'flood%'`);

  // Rows not seen for 30 days are deleted at the next report, even a repeat.
  await db.exec(`update public.error_reports set last_seen = now() - interval '31 days', first_seen = now() - interval '40 days' where message = 'Line one line two'`);
  await report(null, ['browser', 'TypeError: x is undefined', null, '/auth/login', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'Line one line two'`)).length, 0, 'older than 30 days: deleted'); ok();

  await assert.rejects(as(null, `select * from public.error_reports`), /permission denied/); ok();
  await assert.rejects(as(B, `select * from public.error_reports`), /permission denied/); ok();
  await assert.rejects(as(B, `select * from public.admin_error_reports()`), /Only admins/); ok();
  await assert.rejects(as(null, `select * from public.admin_error_reports()`), /permission denied/); ok();
  await assert.rejects(as(B, `select public.rg_redact('x')`), /permission denied/, 'helper not callable'); ok();
  // The admin list also drops expired rows, and says how many are open in all.
  await db.exec(`insert into public.error_reports (fingerprint, source, message, first_seen, last_seen)
                 values (md5('expired'), 'browser', 'expired one', now() - interval '60 days', now() - interval '45 days')`);
  const list = await as(A, `select * from public.admin_error_reports()`);
  assert.ok(list.length >= 2 && list.every((e) => e.resolved_at === null)); ok();
  assert.ok(!list.some((e) => e.message === 'expired one') && !(await q(`select 1 from public.error_reports where message = 'expired one'`)).length, 'expired: gone'); ok();
  assert.equal(Number(list[0].open_count), (await one(`select count(*)::int n from public.error_reports where resolved_at is null`)).n); ok();
  assert.equal(Number((await as(A, `select open_count from public.admin_error_reports(false, 1)`))[0].open_count), list.length, 'count is not cut by the limit'); ok();
  const target = list.find((e) => e.message === 'TypeError: x is undefined');
  await assert.rejects(as(B, `select public.admin_resolve_error($1)`, [target.id]), /Only admins/); ok();
  await as(A, `select public.admin_resolve_error($1)`, [target.id]);
  await assert.rejects(as(A, `select public.admin_resolve_error($1)`, [target.id]), /already marked as fixed/); ok();
  assert.equal((await one(`select count(*)::int n from public.audit_log where action = 'error.fixed'`)).n, 1, 'audited'); ok();
  assert.ok(!(await as(A, `select id from public.admin_error_reports()`)).some((e) => e.id === target.id), 'fixed ones hidden'); ok();
  assert.ok((await as(A, `select id from public.admin_error_reports(true)`)).some((e) => e.id === target.id), 'and listed on request'); ok();
  await reset();
  await report(C, ['browser', 'TypeError: x is undefined', null, '/auth/login', null, null]);
  assert.equal((await q(`select 1 from public.error_reports where message = 'TypeError: x is undefined' and resolved_at is null`)).length, 1, 'comes back after a fix'); ok();
});
console.log('ERROR LOG: no query strings, ids, emails or tokens; grouped and counted; capped for floods; 30 days; admins only; fixes audited');

// ---------------------------------------------------------------- 6. grants for everything new
await check('grants', async () => {
  for (const fn of ['accept_terms(text, boolean)', 'admin_error_reports(boolean, integer)', 'admin_resolve_error(bigint)', 'current_terms_version()',
    'rg_tsquery(text)', 'rg_like_pattern(text)', 'rg_redact(text)', 'rg_post_text(text)', 'rg_post_text_document(text)']) {
    assert.equal((await one(`select has_function_privilege('anon', 'public.${fn}', 'execute') x`)).x, false, `anon: ${fn}`); ok();
  }
  assert.equal((await one(`select has_function_privilege('anon', 'public.report_error(text,text,text,text,text,text)', 'execute') x`)).x, true); ok();
  assert.equal((await one(`select has_function_privilege('authenticated', 'public.rg_redact(text)', 'execute') x`)).x, false); ok();
  for (const t of ['user_consents', 'error_reports']) {
    assert.equal((await one(`select relrowsecurity r from pg_class where oid = 'public.${t}'::regclass`)).r, true, `${t}: RLS on`); ok();
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['insert', 'update', 'delete']) {
        assert.equal((await one(`select has_table_privilege('${role}', 'public.${t}', '${priv}') x`)).x, false, `${role} ${priv} ${t}`);
      }
    }
    ok();
  }
});
console.log('GRANTS: new tables closed (consents readable by their owner only), new functions signed-in only except report_error');

console.log(`\nALL PHASE 5 CHECKS PASSED: ${passed}`);
