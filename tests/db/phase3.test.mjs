// Phase 3 migration test: post text access, paper access requests, research
// metrics (with a fake OpenAlex), and search/suggestion/recommendation parity
// with the browser code they replace. Runs on the final schema too: after the
// closing file, the Phase 4 migrations are applied and everything is checked
// again from there on.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { makeDb, MIG } from './harness.mjs';

let passed = 0;
const ok = () => { passed += 1; };

// Up to Phase 3, with Phase 3 run twice (it must be safe to re-run).
const db = await makeDb({ upTo: 6, rerun: ['20261015000000_phase3_server_side.sql'] });
const closeText = '20261015010000_close_post_text.sql';
console.log('MIGRATIONS: applied, phase 3 re-run OK'); ok();

const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C] = [u(1), u(2), u(3)];
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}','a@x.dev','{"full_name":"Alice Owner","department":"CSE"}'),
  ('${B}','b@x.dev','{"full_name":"Bob Reader","department":"CSE"}'),
  ('${C}','c@x.dev','{"full_name":"Carol Other","department":"EEE"}');`);

const as = (user, sql, params) => db.transaction(async (tx) => {
  await tx.exec(user ? `set local role authenticated; set local request.jwt.claim.sub = '${user}';` : `set local role anon; set local request.jwt.claim.sub = '';`);
  return (await tx.query(sql, params)).rows;
});

// ---------- 1. post text ----------
const P = { pub: u(101), abs: u(102), priv: u(103), absGranted: u(104) };
await db.exec(`insert into public.contents (id, user_id, title, content, abstract, visibility_mode) values
  ('${P.pub}','${A}','Public post','public body','pub abstract','public'),
  ('${P.abs}','${A}','Abstract post','secret body','abs abstract','abstract_only'),
  ('${P.priv}','${A}','Private post','private body',null,'private'),
  ('${P.absGranted}','${A}','Granted post','granted body','g abstract','abstract_only');`);
await db.exec(`insert into public.paper_access_requests (content_id, requester_id, owner_id, status) values ('${P.absGranted}','${B}','${A}','approved')`);

// Before the closing file, the old app code (which reads content directly) still works.
assert.equal((await as(B, `select content from public.contents where id = '${P.pub}'`))[0].content, 'public body'); ok();
await db.exec(readFileSync(new URL(closeText, MIG), 'utf8'));
await db.exec(readFileSync(new URL(closeText, MIG), 'utf8'));
// From here on: the final schema.
await db.exec(readFileSync(new URL('20261016000000_phase4.sql', MIG), 'utf8'));
await db.exec(readFileSync(new URL('20261016010000_phase4_after_deploy.sql', MIG), 'utf8'));
await assert.rejects(as(B, `select content from public.contents`), /permission denied/); ok();
await assert.rejects(as(B, `select * from public.contents`), /permission denied/); ok();
const visible = await as(B, `select id, title, abstract, visibility_mode, keywords, user_id from public.contents order by title`);
assert.deepEqual(visible.map((r) => r.title), ['Abstract post', 'Granted post', 'Public post'], 'B sees public + abstract-only rows, not private'); ok();
const textsFor = async (user) => Object.fromEntries((await as(user, `select * from public.readable_post_texts($1)`, [[P.pub, P.abs, P.priv, P.absGranted]])).map((r) => [r.content_id, r.content]));
assert.deepEqual(await textsFor(B), { [P.pub]: 'public body', [P.absGranted]: 'granted body' }, 'B: public text + granted abstract-only text only'); ok();
assert.deepEqual(await textsFor(C), { [P.pub]: 'public body' }, 'C: only the public text'); ok();
assert.equal(Object.keys(await textsFor(A)).length, 4, 'owner reads all own texts'); ok();
await assert.rejects(as(null, `select * from public.readable_post_texts($1)`, [[P.pub]]), /permission denied/); ok();
await assert.rejects(as(B, `select public.can_read_post_text($1, 'public', $2)`, [A, P.pub]), /permission denied/); ok();
// writes still work for the owner, with the id returned
const inserted = await as(A, `insert into public.contents (user_id, title, content, visibility_mode) values ('${A}','New','new body','public') returning id`);
assert.ok(inserted[0].id); ok();
await as(A, `update public.contents set content = 'edited body', title = 'New 2' where id = '${inserted[0].id}'`);
assert.equal((await db.query(`select content from public.contents where id = '${inserted[0].id}'`)).rows[0].content, 'edited body'); ok();
await as(A, `delete from public.contents where id = '${inserted[0].id}'`);
assert.equal((await db.query(`select count(*)::int n from public.contents where id = '${inserted[0].id}'`)).rows[0].n, 0); ok();
// comments etc. still follow the post (policies read contents columns as the user)
await as(B, `insert into public.comments (content_id, user_id, comment_text) values ('${P.abs}','${B}','nice')`); ok();
await assert.rejects(as(B, `insert into public.comments (content_id, user_id, comment_text) values ('${P.priv}','${B}','x')`), /row-level security/); ok();
console.log('POST TEXT: content column closed, readable_post_texts follows public/own/approved, writes and policies unaffected');

// ---------- 2. paper access requests ----------
await assert.rejects(as(C, `insert into public.paper_access_requests (content_id, requester_id, owner_id, status) values ('${P.abs}','${C}','${A}','approved')`), /row-level security/, 'cannot create an approved request'); ok();
await as(C, `insert into public.paper_access_requests (content_id, requester_id, owner_id, status, reason) values ('${P.abs}','${C}','${A}','pending','please')`); ok();
await as(C, `update public.paper_access_requests set status = 'approved' where requester_id = '${C}'`);
assert.equal((await db.query(`select status from public.paper_access_requests where requester_id = '${C}'`)).rows[0].status, 'pending', 'requester cannot approve own request'); ok();
const cBefore = await textsFor(C);
assert.equal(cBefore[P.abs], undefined); ok();
await as(A, `update public.paper_access_requests set status = 'approved', approved_at = now(), rejected_at = null, updated_at = now() where requester_id = '${C}' and content_id = '${P.abs}'`); ok();
assert.equal((await textsFor(C))[P.abs], 'secret body', 'approved by the owner -> text readable'); ok();
await assert.rejects(as(A, `update public.paper_access_requests set content_id = '${P.pub}' where requester_id = '${C}'`), /permission denied/, 'owner cannot re-point a request'); ok();
await assert.rejects(as(A, `update public.paper_access_requests set requester_id = '${B}' where requester_id = '${C}'`), /permission denied/); ok();
console.log('PAPER ACCESS: requests start pending, only the owner changes status, nobody re-points them');

// ---------- 3. research metrics ----------
await as(B, `update public.profiles set external_h_index = 99, external_citation_count = 12345, bio = 'hello' where id = '${B}'`);
let bRow = (await db.query(`select external_h_index, external_citation_count, bio from public.profiles where id = '${B}'`)).rows[0];
assert.deepEqual([bRow.external_h_index, bRow.external_citation_count, bRow.bio], [0, 0, 'hello'], 'browser writes to metrics are ignored, other fields saved'); ok();
// Since Phase 4 a failed attempt returns no row (instead of an error, which
// would also undo the once-per-30-seconds record) and counts for the limit.
const allowNextSync = () => db.exec(`update public.profiles set external_metrics_synced_at = now() - interval '5 minutes' where id = '${B}';
                                     delete from public.action_rate_limits;`);
await assert.rejects(as(B, `select * from public.sync_my_research_metrics('1234')`), /Invalid ORCID/); ok();
await assert.rejects(as(null, `select * from public.sync_my_research_metrics('0000-0002-1825-0097')`), /permission denied/); ok();
assert.equal((await as(B, `select * from public.sync_my_research_metrics('0000-0002-1825-0097')`)).length, 0, 'no OpenAlex author profile: no row'); ok();
await assert.rejects(as(B, `select * from public.sync_my_research_metrics('0000-0002-1825-0097')`), /a moment ago/, 'a failed attempt counts too'); ok();
await allowNextSync();
await db.exec(`insert into test.http_fixtures (uri, status, content, location) values
  ('https://api.openalex.org/authors/orcid:0000-0002-1825-0097', 200, '{"id":"https://openalex.org/A1","works_count":42,"cited_by_count":1234,"summary_stats":{"h_index":17}}', null),
  ('https://api.openalex.org/authors/orcid:0000-0001-5109-370X', 301, '', 'https://api.openalex.org/authors/A2'),
  ('https://api.openalex.org/authors/A2', 200, '{"works_count":5,"cited_by_count":50,"summary_stats":{"h_index":3}}', null),
  ('https://api.openalex.org/authors/orcid:0000-0003-1111-2222', 302, '', 'https://evil.example/steal'),
  ('https://api.openalex.org/authors/orcid:0000-0003-3333-4444', 500, 'oops', null);`);
const synced = (await as(B, `select * from public.sync_my_research_metrics(' 0000-0002-1825-0097 ')`))[0];
assert.deepEqual([synced.orcid_id, synced.publication_count, synced.citation_count, synced.h_index], ['0000-0002-1825-0097', 42, 1234, 17]); ok();
bRow = (await db.query(`select orcid_id, external_publication_count p, external_citation_count c, external_h_index h, external_metrics_synced_at s from public.profiles where id = '${B}'`)).rows[0];
assert.deepEqual([bRow.orcid_id, bRow.p, bRow.c, bRow.h], ['0000-0002-1825-0097', 42, 1234, 17]); assert.ok(bRow.s); ok();
await assert.rejects(as(B, `select * from public.sync_my_research_metrics('0000-0002-1825-0097')`), /a moment ago/, 'rate limited'); ok();
await allowNextSync();
const redirected = (await as(B, `select * from public.sync_my_research_metrics('0000-0001-5109-370x')`))[0];
assert.deepEqual([redirected.orcid_id, redirected.h_index], ['0000-0001-5109-370X', 3], 'merged author redirect followed (X upper-cased)'); ok();
await allowNextSync();
assert.equal((await as(B, `select * from public.sync_my_research_metrics('0000-0003-1111-2222')`)).length, 0, 'redirect outside OpenAlex not followed'); ok();
assert.equal((await db.query(`select count(*)::int n from test.http_calls where uri like 'https://evil%'`)).rows[0].n, 0); ok();
await allowNextSync();
assert.equal((await as(B, `select * from public.sync_my_research_metrics('0000-0003-3333-4444')`)).length, 0, 'OpenAlex error: no row'); ok();
// a later browser save keeps the synced numbers
await as(B, `update public.profiles set bio = 'changed', external_h_index = 0 where id = '${B}'`);
assert.equal((await db.query(`select external_h_index h from public.profiles where id = '${B}'`)).rows[0].h, 3); ok();
// service role / admin can still set them (data moves)
await db.exec(`update public.profiles set external_h_index = 7 where id = '${C}'`);
assert.equal((await db.query(`select external_h_index h from public.profiles where id = '${C}'`)).rows[0].h, 7); ok();
console.log('METRICS: browser writes ignored, sync fetches from OpenAlex, redirects only inside OpenAlex, rate limited (failed attempts too, no row)');

// ---------- 4. search parity with the old browser code ----------
// Old Search page helpers, copied as they were.
function normalizeText(value) { return (value || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function getTokens(...values) { const text = normalizeText(values.filter(Boolean).join(' ')); return new Set(text.split(' ').map((i) => i.trim()).filter((i) => i.length >= 2)); }
function includesQuery(query, ...values) { const q = normalizeText(query); if (!q) return false; return normalizeText(values.filter(Boolean).join(' ')).includes(q); }
function overlapCount(a, b) { let n = 0; a.forEach((i) => { if (b.has(i)) n += 1; }); return n; }
function scoreSuggestion(profile, current, searchTokens) {
  let score = 0; if (!current) return score;
  const ct = getTokens(current.skills, current.interests, current.research_area, current.expertise);
  const pt = getTokens(profile.skills, profile.interests, profile.research_area, profile.expertise, profile.bio);
  score += overlapCount(ct, pt) * 12; score += overlapCount(searchTokens, pt) * 8;
  if (current.department && profile.department && current.department.toLowerCase() === profile.department.toLowerCase()) score += 20;
  if (current.user_role === 'student' && profile.user_role === 'alumni') score += 18;
  if (current.user_role === 'student' && profile.user_role === 'faculty') score += 18;
  if (profile.mentorship_available) score += 12;
  if ((profile.profile_completion_score || 0) >= 70) score += 8;
  if (profile.current_position || profile.company_or_institution) score += 5;
  return score;
}
// Old Recommendations page helpers.
const STOP = new Set(['a','an','and','are','as','at','be','by','for','from','has','in','is','it','of','on','or','that','the','this','to','with','we','will','research','project','paper','study','work']);
function kwText(v) { return (v || '').toLowerCase().replace(/[_/,-]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function extractKeywords(...values) { const text = values.map(kwText).join(' '); return Array.from(new Set(text.split(' ').map((w) => w.trim()).filter((w) => w.length >= 3 && !STOP.has(w)))); }
function shared(postKw, profKw) { const s = new Set(profKw); return postKw.filter((k) => s.has(k)); }
function recommend(post, cand, current) {
  const pk = extractKeywords(post.title, post.content, post.post_type);
  const ck = extractKeywords(cand.full_name, cand.department, cand.skills, cand.interests, cand.bio);
  const matched = shared(pk, ck);
  let score = 20;
  if (matched.length > 0) score += Math.min(matched.length * 12, 45);
  const skillM = shared(pk, [...extractKeywords(cand.skills), ...extractKeywords(cand.interests)]);
  if (skillM.length > 0) score += Math.min(skillM.length * 10, 25);
  const cd = kwText(current?.department), dd = kwText(cand.department);
  const same = Boolean(cd && dd && cd === dd);
  if (same) score += 8;
  const longBio = Boolean(cand.bio && cand.bio.trim().length > 20);
  if (longBio) score += 5;
  if (cand.skills && cand.skills.trim().length > 0) score += 5;
  if (cand.interests && cand.interests.trim().length > 0) score += 5;
  return { score: Math.min(score, 96), matched, skillM, same, longBio };
}

// Random but repeatable data.
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const words = ['AI', 'machine-learning', 'NLP', 'deep learning', 'Java', 'C++', 'data/science', 'robotics', 'IoT',
  'cloud_computing', 'the', 'study', 'Research', 'vision', 'graph', 'Bangla', 'networks', 'security', 'web,dev', 'bio-informatics', 'a', 'é-learning'];
const sentence = (n) => Array.from({ length: n }, () => pick(words)).join(pick([' ', ', ', '; ', ' - ']));
const roles = ['student', 'alumni', 'faculty', null];
const depts = ['CSE', 'cse', 'EEE', 'Civil Engineering', '', null];
const people = [];
for (let i = 10; i < 70; i++) {
  const p = {
    id: u(i), email: `p${i}@x.dev`, full_name: rnd() < 0.9 ? `Person ${sentence(1)} ${i}` : null,
    department: pick(depts), skills: rnd() < 0.8 ? sentence(1 + Math.floor(rnd() * 4)) : (rnd() < 0.5 ? '   ' : null),
    interests: rnd() < 0.8 ? sentence(1 + Math.floor(rnd() * 3)) : null, bio: rnd() < 0.6 ? sentence(2 + Math.floor(rnd() * 8)) : null,
    user_role: pick(roles), academic_level: pick(['undergraduate', 'masters', null]), batch: pick(['18', '19', null]),
    session: pick(['2019-20', null]), current_position: rnd() < 0.3 ? 'Lecturer' : null,
    company_or_institution: rnd() < 0.2 ? 'PUST' : null, research_area: rnd() < 0.5 ? sentence(2) : null,
    expertise: rnd() < 0.3 ? sentence(2) : null, mentorship_available: rnd() < 0.3,
    profile_completion_score: Math.floor(rnd() * 100),
  };
  people.push(p);
}
for (const p of people) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [p.id, p.email]);
  await db.query(`update public.profiles set full_name=$2, department=$3, skills=$4, interests=$5, bio=$6, user_role=$7, academic_level=$8,
    batch=$9, session=$10, current_position=$11, company_or_institution=$12, research_area=$13, expertise=$14, mentorship_available=$15,
    profile_completion_score=$16 where id=$1`, [p.id, p.full_name, p.department, p.skills, p.interests, p.bio, p.user_role, p.academic_level,
    p.batch, p.session, p.current_position, p.company_or_institution, p.research_area, p.expertise, p.mentorship_available, p.profile_completion_score]);
}
const me = people[0];
await db.query(`update public.profiles set user_role = 'student', department = 'CSE', skills = 'AI, NLP, Java', interests = 'robotics; vision' where id = $1`, [me.id]);
Object.assign(me, { user_role: 'student', department: 'CSE', skills: 'AI, NLP, Java', interests: 'robotics; vision' });
await db.query(`insert into public.search_events (user_id, query, search_type, created_at) values ($1, 'graph networks', 'global', now() - interval '1 hour'), ($1, 'IoT', 'global', now())`, [me.id]);

const allProfiles = (await db.query(`select * from public.profiles`)).rows;
const others = allProfiles.filter((p) => p.id !== me.id);

// search_researchers
for (const q of ['ai', 'machine learning', 'CSE', 'c++', 'Person', 'é', 'zzz', ' ', 'data science', 'p1']) {
  const got = (await as(me.id, `select id from public.search_researchers($1, 100)`, [q])).map((r) => r.id).sort();
  const want = others.filter((p) => includesQuery(q, p.full_name, p.email, p.department, p.skills, p.interests, p.user_role, p.academic_level,
    p.batch, p.session, p.current_position, p.company_or_institution, p.research_area, p.expertise, p.bio)).map((p) => p.id).sort();
  // Bangla/accented letters: Postgres keeps letters JS's \w dropped; only the 'é' query may differ, and only by finding more.
  if (q === 'é') { assert.ok(want.every((id) => got.includes(id)), 'é: never fewer results'); }
  else assert.deepEqual(got, want, `search_researchers("${q}")`);
  ok();
}
// browse_researchers (directory): include self, ordered by name, matched the
// way the old Researchers page did it (lower case, punctuation kept).
const oldDirectoryMatch = (p, q) => {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return [p.full_name, p.email, p.department, p.skills, p.interests, p.bio].filter(Boolean).join(' ').toLowerCase().includes(query);
};
for (const q of ['', 'cse', 'java', 'p2', 'c++', '  JAVA ', '.com', 'c#']) {
  const got = (await as(me.id, `select id from public.browse_researchers($1, 100)`, [q])).map((r) => r.id).sort();
  const want = allProfiles.filter((p) => oldDirectoryMatch(p, q)).map((p) => p.id).sort();
  assert.deepEqual(got, want, `browse_researchers("${q}")`); ok();
}
const firstPage = await as(me.id, `select full_name from public.browse_researchers('', 5)`);
assert.equal(firstPage.length, 5); ok();
// Pages of 7 put together give the whole directory, in order, with nothing twice.
const everyone = (await as(me.id, `select id from public.browse_researchers('', 100)`)).map((r) => r.id);
const paged = [];
for (let skip = 0; skip < everyone.length + 7; skip += 7) {
  paged.push(...(await as(me.id, `select id from public.browse_researchers('', 7, $1)`, [skip])).map((r) => r.id));
}
assert.deepEqual(paged, everyone, 'pages join up'); ok();
assert.equal((await as(me.id, `select id from public.browse_researchers('', 1000)`)).length, Math.min(100, allProfiles.length), 'page size capped at 100'); ok();
assert.equal((await as(me.id, `select id from public.browse_researchers('', 5, -3)`)).length, 5, 'negative skip treated as 0'); ok();

// suggest_researchers
const history = ['IoT', 'graph networks'];
const searchTokens = getTokens(...history);
const jsScores = others.map((p) => ({ id: p.id, score: scoreSuggestion(p, me, searchTokens) })).filter((x) => x.score > 0);
const sqlSugg = await as(me.id, `select id, suggestion_score from public.suggest_researchers(50)`);
const jsMap = Object.fromEntries(jsScores.map((x) => [x.id, x.score]));
for (const r of sqlSugg) assert.equal(r.suggestion_score, jsMap[r.id], `suggestion score for ${r.id}`);
assert.equal(sqlSugg.length, Math.min(50, jsScores.length)); ok();
const top8 = await as(me.id, `select suggestion_score from public.suggest_researchers(8)`);
const jsTop8 = jsScores.map((x) => x.score).sort((a, b) => b - a).slice(0, 8);
assert.deepEqual(top8.map((r) => r.suggestion_score), jsTop8, 'top 8 suggestion scores'); ok();
console.log('SEARCH: researcher search, directory and suggestions match the old browser results');

// search_posts with hidden posts and text rules
const postSeeds = [];
for (let i = 0; i < 40; i++) {
  const owner = pick([me.id, A, B, C, people[3].id]);
  const vis = pick(['public', 'public', 'abstract_only', 'private']);
  const row = { id: u(500 + i), user_id: owner, title: rnd() < 0.9 ? `Title ${sentence(2)}` : null, content: sentence(6), abstract: rnd() < 0.5 ? sentence(3) : null,
    keywords: rnd() < 0.6 ? sentence(2) : null, post_type: pick(['research_note', 'dataset']), content_category: pick(['general_post', 'research_paper']), vis };
  postSeeds.push(row);
  await db.query(`insert into public.contents (id, user_id, title, content, abstract, keywords, post_type, content_category, visibility_mode, created_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - ($10 || ' minutes')::interval)`, [row.id, row.user_id, row.title, row.content, row.abstract, row.keywords, row.post_type, row.content_category, row.vis, String(i)]);
}
await db.query(`insert into public.hidden_posts (user_id, content_id) values ($1, $2)`, [me.id, postSeeds[1].id]);
await db.query(`insert into public.paper_access_requests (content_id, requester_id, owner_id, status) select id, $1, user_id, 'approved' from public.contents where visibility_mode = 'abstract_only' and user_id <> $1 limit 1`, [me.id]);
const grantedIds = new Set((await db.query(`select content_id from public.paper_access_requests where requester_id = $1 and status = 'approved'`, [me.id])).rows.map((r) => r.content_id));
for (const q of ['ai', 'learning', 'title', 'dataset', 'research paper', 'web dev', 'zzz']) {
  const got = (await as(me.id, `select id, content from public.search_posts($1, 100)`, [q]));
  const readable = (p) => p.user_id === me.id || p.vis === 'public' || (p.vis === 'abstract_only' && grantedIds.has(p.id));
  const want = postSeeds.filter((p) => (p.vis !== 'private' || p.user_id === me.id) && p.id !== postSeeds[1].id)
    .filter((p) => includesQuery(q, p.title, readable(p) ? p.content : null, p.abstract, p.keywords, p.post_type, p.content_category));
  assert.deepEqual(got.map((r) => r.id).sort(), want.map((p) => p.id).sort(), `search_posts("${q}")`);
  for (const r of got) { const p = postSeeds.find((x) => x.id === r.id); assert.equal(r.content, readable(p) ? p.content : null, 'text only when readable'); }
  ok();
}
console.log('SEARCH: posts follow privacy, hidden posts and readable text');

// recommend_collaborators
const myPosts = postSeeds.filter((p) => p.user_id === me.id);
for (const post of myPosts.slice(0, 6)) {
  const got = await as(me.id, `select * from public.recommend_collaborators($1, 50)`, [post.id]);
  const expected = others.map((c) => ({ id: c.id, ...recommend(post, c, me) })).sort((a, b) => b.score - a.score);
  const expMap = Object.fromEntries(expected.map((e) => [e.id, e]));
  for (const r of got) {
    const e = expMap[r.id];
    assert.equal(r.score, e.score, 'score'); assert.deepEqual(r.matched_keywords, e.matched, 'matched keywords in order');
    assert.deepEqual(r.skill_keywords, e.skillM, 'skill keywords'); assert.equal(r.same_department, e.same); assert.equal(r.detailed_bio, e.longBio);
  }
  assert.deepEqual(got.map((r) => r.score), expected.slice(0, 50).map((e) => e.score), 'ranking by score'); ok();
}
assert.equal((await as(me.id, `select * from public.recommend_collaborators($1, 12)`, [P.pub])).length, 0, 'not my post -> nothing'); ok();
console.log('RECOMMEND: scores, keywords and ranking match the old browser code');

await assert.rejects(as(null, `select * from public.search_posts('ai', 5)`), /permission denied/); ok();
await assert.rejects(as(null, `select * from public.suggest_researchers(5)`), /permission denied/); ok();
console.log(`ALL ${passed} PHASE 3 ASSERTIONS PASSED`);
