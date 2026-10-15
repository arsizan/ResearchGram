// An in-memory stand-in for Supabase (PostgREST, RPC, Storage, Auth and
// Realtime), wired into a Playwright page through request and WebSocket
// routing. Only what the pages under test use, with simplified copies of the
// database functions' rules. The Next.js server's own sign-in check (proxy.ts)
// talks to tests/e2e/auth-server.mjs instead, at the same address.
// Cloudflare Turnstile (the bot check, Phase 5) is faked here too.
import { readFileSync } from 'node:fs';
import { signEs256, verifyEs256 } from './jwt-keys.mjs';

export const SUPABASE_URL = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
export const COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

/** The Terms version the app asks for (lib/legal.ts). */
export const TERMS_VERSION = readFileSync(new URL('../../lib/legal.ts', import.meta.url), 'utf8').match(/TERMS_VERSION = "([0-9-]+)"/)[1];

const pad = (n) => String(n).padStart(12, '0');
export const uid = (n) => `00000000-0000-4000-8000-${pad(n)}`;

let counter = 1;
const newId = () => uid(900000 + counter++);

// ─── Sessions ────────────────────────────────────────────────────────────────

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * A session the fake accepts. By default signed like a project with the older
 * shared JWT secret (the signature is not checked, the shape is); with
 * `es256` signed like a project with asymmetric signing keys, which proxy.ts
 * then verifies itself against the published key (Phase 5).
 */
export function sessionFor(userId, email, { expiresIn = 24 * 3600, es256 = false, kid } = {}) {
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const claims = { sub: userId, role: 'authenticated', aud: 'authenticated', exp, email };
  const token = es256
    ? signEs256({ ...claims, iss: `${SUPABASE_URL}/auth/v1`, iat: exp - expiresIn, session_id: `s-${userId}` }, { kid })
    : `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.c2lnbmF0dXJl`;
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: exp,
    refresh_token: `fake-refresh:${userId}`,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
}

/** The cookie @supabase/ssr keeps the session in. */
export function sessionCookie(session, domain = '127.0.0.1') {
  return { name: COOKIE_NAME, value: `base64-${b64(session)}`, domain, path: '/', sameSite: 'Lax' };
}

export function userFromToken(token) {
  try {
    const [head, payload, signature] = String(token || '').split('.');
    const alg = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')).alg;
    if (alg === 'ES256' ? !verifyEs256(token) : signature !== 'c2lnbmF0dXJl') return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.sub || claims.exp * 1000 < Date.now()) return null;
    return { id: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}

// ─── Data ────────────────────────────────────────────────────────────────────

export function makeDb() {
  const U = uid(1);
  const base = Date.now() - 90 * 24 * 3600 * 1000;
  const iso = (minutes) => new Date(base + minutes * 60000).toISOString();

  const profile = (id, name, extra = {}) => ({
    id, full_name: name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@test.dev`, department: 'CSE', skills: 'AI, ML', interests: 'NLP',
    bio: null, user_role: 'student', academic_level: 'undergraduate', onboarding_completed: true, profile_pic_url: null, cover_photo_url: null,
    orcid_id: null, orcid_verified_at: null, external_publication_count: 0, external_citation_count: 0, external_h_index: 0,
    external_metrics_synced_at: null, mentorship_available: false, profile_completion_score: 50, ...extra,
  });

  const profiles = [profile(U, 'Test Me', { email: 'me@test.dev' })];
  for (let i = 2; i <= 12; i++) profiles.push(profile(uid(i), `Researcher ${i}`));

  const conversations = [];
  const conversation_members = [];
  const messages = [];
  // Direct chats with researchers 2-5; chat 1 has two unread messages.
  for (let c = 1; c <= 4; c++) {
    const cid = uid(500 + c);
    const other = uid(c + 1);
    const last = 80000 - c * 100;
    for (let k = 1; k <= 3; k++) {
      messages.push({ id: uid(1000 + c * 10 + k), conversation_id: cid, sender_id: k % 2 ? other : U, body: `Chat ${c} message ${k}`, message_text: null, read_at: null, is_deleted: false, created_at: iso(last - (3 - k)), attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null, attachment_kind: null, attachment_duration_seconds: null });
    }
    conversations.push({ id: cid, participant_one_id: U, participant_two_id: other, conversation_type: 'direct', title: null, content_id: null, request_id: null, workspace_id: null, created_by: U, last_message_at: iso(last), created_at: iso(0), updated_at: iso(last) });
    conversation_members.push({ id: uid(800 + c), conversation_id: cid, user_id: U, role: 'member', last_read_at: c === 1 ? iso(last - 5) : iso(last + 1), muted: false, joined_at: iso(0) });
    conversation_members.push({ id: uid(850 + c), conversation_id: cid, user_id: other, role: 'member', last_read_at: iso(last + 1), muted: false, joined_at: iso(0) });
  }

  const contents = [];
  for (let p = 1; p <= 12; p++) {
    contents.push({ id: uid(2000 + p), title: `Post number ${p}`, content: `Body of post ${p}`, abstract: null, content_category: 'general_post', visibility_mode: 'public', full_paper_access_mode: 'public', allow_full_paper_request: false, doi: null, keywords: null, publication_status: 'published', publisher_name: null, publication_date: null, post_type: 'research_note', created_at: iso(50000 - p), updated_at: iso(50000 - p), user_id: p % 3 === 0 ? U : uid(2) });
  }

  const notifications = [];
  for (let n = 1; n <= 5; n++) {
    notifications.push({ id: uid(3000 + n), recipient_id: U, actor_id: uid(2), notification_type: 'comment', title: `Notification ${n}`, body: 'Someone commented on your post.', link_url: '/feed', content_id: null, request_id: null, request_kind: null, is_read: n > 2, metadata: {}, created_at: iso(60000 - n), read_at: null });
  }

  return {
    U,
    iso,
    admins: new Set(),
    audit: [],
    storage: [], // { bucket, path, owner, size, contentType }
    rpcCalls: [],
    writes: [],
    deletedAccount: false,
    // Bot check (Phase 5): Supabase refuses sign-up, login and reset requests
    // without a fresh token; each token works once.
    captcha: { required: true, used: new Set(), seen: [] },
    turnstileDown: false,
    signups: [],
    recoveries: [],
    errorReports: [],
    adminErrors: [],
    tables: {
      profiles, conversations, conversation_members, messages, contents, notifications,
      // Researcher 2 is a connection; 3 sent a collaboration request.
      user_connections: [{ id: uid(700), user_one_id: U, user_two_id: uid(2), created_at: iso(10) }],
      profile_requests: [],
      research_requests: [{ id: uid(710), content_id: uid(2003), requester_id: uid(3), receiver_id: U, request_type: 'collaboration', message: 'Can we work together?', status: 'pending', created_at: iso(70000), updated_at: iso(70000) }],
      paper_access_requests: [],
      hidden_posts: [], content_attachments: [], comments: [], saved_posts: [], content_authors: [],
      post_reports: [],
      workspaces: [], workspace_members: [], workspace_tasks: [], workspace_files: [], workspace_milestones: [],
      workspace_meetings: [], workspace_recordings: [], workspace_updates: [],
      search_events: [], profile_view_events: [],
      // The signed-in test user accepted the current Terms already.
      user_consents: [{ user_id: U, terms_version: TERMS_VERSION, accepted_at: iso(1) }],
    },
  };
}

// ─── PostgREST query subset ──────────────────────────────────────────────────

function splitTop(s) {
  const out = []; let depth = 0, cur = '', quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function test(row, col, expr) {
  const v = row[col];
  const [op, ...rest] = expr.split('.');
  const val = rest.join('.');
  const str = (x) => (x === null || x === undefined ? null : String(x));
  switch (op) {
    case 'eq': return str(v) === val;
    case 'neq': return str(v) !== val;
    case 'is': return val === 'null' ? v === null || v === undefined : str(v) === val;
    case 'in': return val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(str(v));
    case 'gt': return str(v) > val;
    case 'lt': return str(v) < val;
    case 'gte': return str(v) >= val;
    case 'lte': return str(v) <= val;
    case 'ilike': {
      const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', 'i');
      return re.test(str(v) ?? '');
    }
    case 'and': {
      const parts = splitTop(val.replace(/^\(|\)$/g, ''));
      return parts.every((p) => { const [c, ...e] = p.split('.'); return test(row, c, e.join('.')); });
    }
    default: return true;
  }
}

function matches(row, params) {
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
    if (key === 'or') {
      const parts = splitTop(value.replace(/^\(|\)$/g, ''));
      const any = parts.some((p) => {
        if (p.startsWith('and(')) return test(row, '', `and.${p.slice(3)}`);
        const [c, ...e] = p.split('.');
        return test(row, c, e.join('.'));
      });
      if (!any) return false;
      continue;
    }
    if (!test(row, key, value)) return false;
  }
  return true;
}

function applyQuery(db, table, params) {
  let rows = (db.tables[table] || []).filter((r) => matches(r, params));
  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((o) => o.split('.'));
    rows = rows.slice().sort((a, b) => {
      for (const [c, dir] of keys) {
        if (a[c] === b[c]) continue;
        const cmp = (a[c] ?? '') < (b[c] ?? '') ? -1 : 1;
        return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }
  return rows;
}

function project(db, rows, select) {
  if (!select || !select.includes('profiles')) return rows;
  const byId = Object.fromEntries(db.tables.profiles.map((p) => [p.id, p]));
  return rows.map((r) => {
    const owner = r.user_id ?? r.profile_id;
    return { ...r, profiles: owner && byId[owner] ? { ...byId[owner] } : null };
  });
}

// The browser may not read contents.content (Phase 3 closing file).
function readsPrivatePostText(table, params) {
  if (table !== 'contents') return false;
  const select = params.get('select');
  if (select === null) return true;
  const top = splitTop(select).filter((c) => !c.includes('(')).map((c) => c.split(':').pop().split('::')[0].trim());
  if (top.includes('*') || top.includes('content')) return true;
  return false;
}

// ─── Database functions (simplified copies of the SQL) ──────────────────────

class PgError extends Error {
  constructor(code, message) { super(message); this.pg = { code, message, details: null, hint: null }; }
}
const userError = (message) => new PgError('P0001', message);

function summaries(db) {
  return db.tables.conversation_members.filter((m) => m.user_id === db.U).map((m) => {
    const live = db.tables.messages.filter((x) => x.conversation_id === m.conversation_id && !x.is_deleted);
    const unread = live.filter((x) => x.sender_id !== m.user_id && (!m.last_read_at || x.created_at > m.last_read_at)).length;
    const last = live.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const preview = last ? (last.body || last.message_text || (last.attachment_kind === 'voice' ? 'Voice message' : last.attachment_name ? `File: ${last.attachment_name}` : null)) : null;
    return { conversation_id: m.conversation_id, unread_count: unread, last_message_id: last?.id ?? null, last_message_body: preview, last_message_sender_id: last?.sender_id ?? null, last_message_read_at: last?.read_at ?? null, last_message_created_at: last?.created_at ?? null, muted: Boolean(m.muted) };
  });
}

function connected(db, a, b) {
  const t = db.tables;
  const pair = (x, y) => (x === a && y === b) || (x === b && y === a);
  return t.user_connections.some((c) => pair(c.user_one_id, c.user_two_id))
    || t.profile_requests.some((r) => r.status === 'accepted' && pair(r.requester_id, r.receiver_id))
    || t.research_requests.some((r) => r.status === 'accepted' && pair(r.requester_id, r.receiver_id));
}

function addMember(db, conversationId, userId, role = 'member') {
  const exists = db.tables.conversation_members.some((m) => m.conversation_id === conversationId && m.user_id === userId);
  if (!exists) db.tables.conversation_members.push({ id: newId(), conversation_id: conversationId, user_id: userId, role, last_read_at: new Date().toISOString(), muted: false, joined_at: new Date().toISOString() });
}

function workspaceChat(db, workspaceId) {
  const t = db.tables;
  let chat = t.conversations.find((c) => c.workspace_id === workspaceId && c.conversation_type === 'workspace_group');
  if (!chat) {
    const ws = t.workspaces.find((w) => w.id === workspaceId);
    chat = { id: newId(), participant_one_id: db.U, participant_two_id: db.U, conversation_type: 'workspace_group', title: `Workspace: ${ws.title}`, content_id: null, request_id: null, workspace_id: workspaceId, created_by: db.U, last_message_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    t.conversations.push(chat);
  }
  addMember(db, chat.id, db.U, 'owner');
  t.workspace_members.filter((m) => m.workspace_id === workspaceId).forEach((m) => addMember(db, chat.id, m.user_id));
  return chat.id;
}

function audit(db, action, targetType, targetId, details = {}) {
  db.audit.unshift({ id: db.audit.length + 1, occurred_at: new Date().toISOString(), actor_id: db.U, actor_name: 'Test Me', action, target_type: targetType, target_id: targetId, details });
}

function requireAdmin(db) {
  if (!db.admins.has(db.U)) throw new PgError('42501', 'Only admins can do this.');
}

/** null when the bot-check token is acceptable, else Supabase's error. */
function captchaProblem(db, body) {
  if (!db.captcha.required) return null;
  const token = body?.gotrue_meta_security?.captcha_token;
  db.captcha.seen.push(token ?? null);
  if (db.captcha.forceFail) return { code: 'captcha_failed', error_code: 'captcha_failed', message: 'captcha protection: request disallowed (invalid-input-response)' };
  if (!token) return { code: 'captcha_failed', error_code: 'captcha_failed', message: 'captcha protection: request disallowed (no captcha_token found)' };
  if (db.captcha.used.has(token)) return { code: 'captcha_failed', error_code: 'captcha_failed', message: 'captcha protection: request disallowed (timeout-or-duplicate)' };
  db.captcha.used.add(token);
  return null;
}

function rpc(db, fn, args) {
  const t = db.tables;
  const now = new Date().toISOString();
  switch (fn) {
    case 'my_conversation_summaries':
      return summaries(db);
    case 'readable_post_texts': {
      const ids = new Set(args.content_ids || []);
      return t.contents.filter((c) => ids.has(c.id) && ((c.visibility_mode || 'public') === 'public' || c.user_id === db.U)).map((c) => ({ content_id: c.id, content: c.content }));
    }
    case 'post_engagement_counts':
      return (args.content_ids || []).map((id) => ({ content_id: id, save_count: 0, request_count: 0 }));
    case 'is_admin':
      return db.admins.has(db.U);

    // Workspaces
    case 'create_workspace': {
      if (!String(args.p_title || '').trim()) throw userError('Add a workspace title.');
      const id = newId();
      t.workspaces.push({ id, owner_id: db.U, title: args.p_title.trim(), description: args.p_description ?? null, research_area: args.p_research_area ?? null, status: 'active', due_date: args.p_due_date ?? null, workspace_type: args.p_workspace_type, created_at: now, updated_at: now });
      t.workspace_members.push({ id: newId(), workspace_id: id, user_id: db.U, role: 'owner', created_at: now });
      if (args.p_workspace_type === 'shared') workspaceChat(db, id);
      return id;
    }
    case 'make_workspace_shared': {
      const ws = t.workspaces.find((w) => w.id === args.p_workspace_id && w.owner_id === db.U);
      if (!ws) throw new PgError('42501', 'Only the workspace owner can do this.');
      ws.workspace_type = 'shared';
      return workspaceChat(db, ws.id);
    }
    case 'add_workspace_member': {
      const ws = t.workspaces.find((w) => w.id === args.p_workspace_id && w.owner_id === db.U);
      if (!ws) throw new PgError('42501', 'Only the workspace owner can add members.');
      if (ws.workspace_type !== 'shared') throw userError('Make this workspace shared first.');
      if (!connected(db, db.U, args.p_user_id)) throw userError('You can add researchers you are connected with.');
      if (t.workspace_members.some((m) => m.workspace_id === ws.id && m.user_id === args.p_user_id)) throw userError('This researcher is already a member.');
      t.workspace_members.push({ id: newId(), workspace_id: ws.id, user_id: args.p_user_id, role: 'member', created_at: now });
      workspaceChat(db, ws.id);
      return null;
    }
    case 'remove_workspace_member': {
      const member = t.workspace_members.find((m) => m.id === args.p_member_id);
      if (!member) throw new PgError('42501', 'Only the workspace owner can remove members.');
      if (member.role === 'owner') throw userError('The workspace owner cannot be removed.');
      t.workspace_members.splice(t.workspace_members.indexOf(member), 1);
      return null;
    }

    // Chats and requests
    case 'start_direct_conversation': {
      const other = args.p_other_user;
      if (!connected(db, db.U, other)) throw userError('You can message researchers you are connected with.');
      let chat = t.conversations.find((c) => c.conversation_type === 'direct' && [c.participant_one_id, c.participant_two_id].includes(db.U) && [c.participant_one_id, c.participant_two_id].includes(other));
      if (!chat) {
        chat = { id: newId(), participant_one_id: db.U, participant_two_id: other, conversation_type: 'direct', title: 'Direct chat', content_id: null, request_id: null, workspace_id: null, created_by: db.U, last_message_at: now, created_at: now, updated_at: now };
        t.conversations.push(chat);
      }
      addMember(db, chat.id, db.U);
      addMember(db, chat.id, other);
      return chat.id;
    }
    case 'open_research_conversation': {
      const req = t.research_requests.find((r) => r.id === args.p_request_id);
      if (!req) throw new PgError('P0002', 'This request was not found.');
      if (req.status === 'declined') throw userError('This request was declined.');
      let chat = t.conversations.find((c) => c.request_id === req.id);
      if (!chat) {
        chat = { id: newId(), participant_one_id: req.requester_id, participant_two_id: req.receiver_id, conversation_type: 'collaboration', title: null, content_id: req.content_id, request_id: req.id, workspace_id: null, created_by: db.U, last_message_at: now, created_at: now, updated_at: now };
        t.conversations.push(chat);
      }
      addMember(db, chat.id, req.requester_id);
      addMember(db, chat.id, req.receiver_id);
      return chat.id;
    }
    case 'respond_to_research_request': {
      const req = t.research_requests.find((r) => r.id === args.p_request_id);
      if (!req || req.receiver_id !== db.U) throw new PgError('42501', 'Only the person who received this request can answer it.');
      if (req.status !== 'pending') throw userError('This request was already answered.');
      req.status = args.p_status;
      const chat = args.p_status === 'accepted' ? rpc(db, 'open_research_conversation', { p_request_id: req.id }) : null;
      t.notifications.push({ id: newId(), recipient_id: req.requester_id, actor_id: db.U, notification_type: args.p_status === 'accepted' ? 'request_accepted' : 'request_declined', title: 'Collaboration request answered', body: null, link_url: chat ? `/messages?conversation=${chat}` : '/requests', content_id: req.content_id, request_id: req.id, request_kind: 'research', is_read: false, metadata: {}, created_at: now, read_at: null });
      return chat;
    }
    case 'respond_to_profile_request':
    case 'respond_to_paper_access_request': {
      const table = fn === 'respond_to_profile_request' ? t.profile_requests : t.paper_access_requests;
      const req = table.find((r) => r.id === args.p_request_id);
      if (!req) throw new PgError('42501', 'Not allowed.');
      if (req.status !== 'pending') throw userError('This request was already answered.');
      req.status = args.p_status;
      return null;
    }

    // Posts
    case 'create_post': {
      if (!String(args.p_title || '').trim()) throw userError('Add a title first.');
      for (const file of args.p_attachments || []) {
        if (!String(file.storage_path).startsWith(`uploads/${db.U}/${args.p_id}/`)) throw userError('A file does not belong to this post.');
        if (!db.storage.some((o) => o.bucket === file.bucket_name && o.path === file.storage_path)) throw userError('A file did not finish uploading. Try again.');
      }
      if (db.failNextCreatePost) { db.failNextCreatePost = false; throw userError('Test: the post could not be saved.'); }
      t.contents.unshift({ id: args.p_id, user_id: db.U, title: args.p_title, content: args.p_content, abstract: args.p_abstract, post_type: args.p_post_type, content_category: args.p_content_category, visibility_mode: args.p_visibility_mode, full_paper_access_mode: args.p_full_paper_access_mode, allow_full_paper_request: false, doi: args.p_doi, keywords: args.p_keywords, publication_status: 'published', created_at: now, updated_at: now });
      (args.p_authors || []).forEach((a, i) => t.content_authors.push({ id: newId(), content_id: args.p_id, profile_id: a.profile_id ?? null, manual_name: a.manual_name ?? null, author_order: i + 1, author_role: 'co_author', created_at: now }));
      (args.p_attachments || []).forEach((file) => t.content_attachments.push({ id: newId(), content_id: args.p_id, ...file, access_level: file.bucket_name === 'restricted-papers' ? 'restricted' : 'public', is_full_paper: file.file_role === 'full_paper', is_preview_file: file.file_role !== 'full_paper', created_at: now }));
      return args.p_id;
    }

    // Account
    case 'my_storage_objects':
      return db.storage.filter((o) => o.owner === db.U).map((o) => ({ bucket_id: o.bucket, name: o.path }));
    case 'export_my_data':
      audit(db, 'account.exported', 'user', db.U);
      return { format: 'researchgram-export-1', exported_at: now, profile: t.profiles.find((p) => p.id === db.U), posts: t.contents.filter((c) => c.user_id === db.U), messages_sent: t.messages.filter((m) => m.sender_id === db.U) };
    case 'delete_my_account': {
      if (args.p_confirm !== 'DELETE') throw userError('Type DELETE to confirm.');
      if (db.storage.some((o) => o.owner === db.U)) throw userError('Some of your files could not be deleted yet. Try again.');
      db.deletedAccount = true;
      audit(db, 'account.deleted', 'user', db.U);
      return null;
    }
    case 'verify_orcid': {
      const me = t.profiles.find((p) => p.id === db.U);
      if (!args.p_code) throw userError('The ORCID sign-in did not finish. Try again.');
      if (args.p_code === 'used-code') return [{ orcid_id: null, verified_at: null, problem: 'ORCID did not confirm the sign-in. Start again from your profile.' }];
      Object.assign(me, { orcid_id: '0000-0002-1825-0097', orcid_verified_at: now });
      return [{ orcid_id: me.orcid_id, verified_at: now, problem: null }];
    }
    case 'sync_my_research_metrics': {
      const me = t.profiles.find((p) => p.id === db.U);
      Object.assign(me, { external_publication_count: 12, external_citation_count: 345, external_h_index: 7, external_metrics_synced_at: now });
      return [{ orcid_id: me.orcid_id, publication_count: 12, citation_count: 345, h_index: 7, synced_at: now }];
    }

    // Admin console
    case 'admin_overview':
      requireAdmin(db);
      return { users: t.profiles.length, new_users_7d: 1, posts: t.contents.length, posts_7d: 2, messages_7d: t.messages.length, pending_reports: t.post_reports.filter((r) => r.status === 'pending').length, reported_posts: new Set(t.post_reports.filter((r) => r.status === 'pending').map((r) => r.content_id)).size, admins: db.admins.size };
    case 'admin_report_queue': {
      requireAdmin(db);
      const wanted = t.post_reports.filter((r) => (args.p_status === 'pending' ? r.status === 'pending' : r.status !== 'pending'));
      const byPost = new Map();
      wanted.forEach((r) => byPost.set(r.content_id, [...(byPost.get(r.content_id) || []), r]));
      return [...byPost].map(([contentId, reports]) => {
        const post = t.contents.find((c) => c.id === contentId);
        const author = t.profiles.find((p) => p.id === post?.user_id);
        return { content_id: contentId, post_title: post?.title ?? null, post_excerpt: post?.content ?? null, post_author_id: post?.user_id ?? null, post_author_name: author?.full_name ?? null, post_visibility: post?.visibility_mode ?? 'public', post_created_at: post?.created_at ?? null, report_count: reports.length, reasons: [...new Set(reports.map((r) => r.reason))], details: reports.map((r) => r.details).filter(Boolean), first_reported_at: reports[0].created_at, last_reported_at: reports[reports.length - 1].created_at, resolved_at: reports[0].resolved_at ?? null, resolution_note: reports[0].resolution_note ?? null };
      });
    }
    case 'admin_dismiss_reports': {
      requireAdmin(db);
      const open = t.post_reports.filter((r) => r.content_id === args.p_content_id && r.status === 'pending');
      if (!open.length) throw new PgError('P0002', 'This post has no open reports.');
      open.forEach((r) => Object.assign(r, { status: 'dismissed', resolved_at: now, resolution_note: args.p_note }));
      audit(db, 'reports.dismissed', 'post', args.p_content_id, { reports: open.length });
      return open.length;
    }
    case 'admin_remove_post': {
      requireAdmin(db);
      if (!String(args.p_reason || '').trim()) throw userError('Give a reason. The author will see it.');
      const post = t.contents.find((c) => c.id === args.p_content_id);
      if (!post) throw new PgError('P0002', 'This post no longer exists.');
      const files = t.content_attachments.filter((a) => a.content_id === post.id).map((a) => ({ bucket: a.bucket_name, path: a.storage_path }));
      t.contents.splice(t.contents.indexOf(post), 1);
      t.post_reports = t.post_reports.filter((r) => r.content_id !== post.id);
      audit(db, 'post.removed', 'post', post.id, { title: post.title, reason: args.p_reason });
      return { files };
    }
    case 'admin_audit_log':
      requireAdmin(db);
      return db.audit.filter((e) => args.p_before == null || e.id < args.p_before).slice(0, args.p_limit ?? 50);

    // Terms and the error log (Phase 5)
    case 'current_terms_version':
      return db.databaseTermsVersion ?? TERMS_VERSION;
    case 'accept_terms': {
      if (args.p_version !== (db.databaseTermsVersion ?? TERMS_VERSION)) throw userError('The Terms were updated. Reload the page and read the new version.');
      if (args.p_age_confirmed !== true) throw userError('ResearchGram is for people aged 18 or older. Confirm your age to continue.');
      t.user_consents = t.user_consents.filter((c) => c.user_id !== db.U);
      t.user_consents.push({ user_id: db.U, terms_version: args.p_version, accepted_at: now, age_confirmed: true });
      return now;
    }
    case 'report_error':
      db.errorReports.push(args);
      return null;
    case 'admin_error_reports': {
      requireAdmin(db);
      if (db.adminErrorsFail) throw new PgError('XX000', 'The error log could not be read.');
      const openCount = db.adminErrors.filter((e) => !e.resolved_at).length;
      return db.adminErrors
        .filter((e) => args.p_include_fixed || !e.resolved_at)
        .slice(0, args.p_limit ?? 50)
        .map((e) => ({ ...e, open_count: openCount }));
    }
    case 'admin_resolve_error': {
      requireAdmin(db);
      const report = db.adminErrors.find((e) => e.id === args.p_id && !e.resolved_at);
      if (!report) throw new PgError('P0002', 'This error was already marked as fixed.');
      report.resolved_at = now;
      audit(db, 'error.fixed', 'error', String(args.p_id));
      return null;
    }
    default:
      return [];
  }
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

// Cloudflare Turnstile as the pages see it: a widget that passes at once and
// hands out a new token whenever it is reset (each token works once).
const FAKE_TURNSTILE = `(() => {
  let issued = 0, ids = 0;
  const widgets = {};
  const issue = (id) => {
    const w = widgets[id];
    if (!w) return;
    issued += 1;
    const token = 'test-token-' + issued;
    w.el.setAttribute('data-token', token);
    if (w.opts.callback) w.opts.callback(token);
  };
  window.turnstile = {
    render(el, opts) {
      const id = 'w' + (++ids);
      widgets[id] = { el, opts };
      el.textContent = 'Security check passed (test)';
      el.setAttribute('data-size', opts.size || '');
      issue(id);
      return id;
    },
    reset(id) { issue(id); },
    remove(id) { delete widgets[id]; },
  };
})();`;

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export async function installFakeSupabase(page, db, { log = () => {} } = {}) {
  const channels = new Map();
  let bindingId = 1000;

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'access-control-expose-headers': 'Content-Range, Content-Location, X-Total-Count',
  };
  // Auth errors carry their code twice, as Supabase Auth sends them ("error_code" is what supabase-js reads).
  const json = (status, body, extra = {}) => {
    const withCode = body && status >= 400 && typeof body.code === 'string' && !body.error_code ? { ...body, error_code: body.code } : body;
    return { status, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: JSON.stringify(withCode) };
  };

  const emit = (table, type, record, oldRecord = {}) => {
    for (const [topic, ch] of channels) {
      for (const b of ch.bindings) {
        if (b.table !== table) continue;
        if (b.event !== '*' && b.event !== type) continue;
        if (b.filter) {
          const [c, e] = b.filter.split('=');
          if (!test(record, c, e)) continue;
        }
        const columns = Object.keys(record).map((name) => ({ name, type: 'text' }));
        const payload = { ids: [b.id], data: { schema: 'public', table, commit_timestamp: new Date().toISOString(), type, record, old_record: oldRecord, columns, errors: null } };
        ch.ws.send(JSON.stringify([null, null, topic, 'postgres_changes', payload]));
      }
    }
  };

  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      if (typeof raw !== 'string') return;
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      const [joinRef, ref, topic, event, payload] = msg;
      if (event === 'heartbeat') { ws.send(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }])); return; }
      if (event === 'phx_join') {
        const pc = (payload?.config?.postgres_changes || []).map((f) => ({ id: bindingId++, event: f.event, schema: f.schema, table: f.table, filter: f.filter }));
        channels.set(topic, { ws, bindings: pc });
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pc } }]));
        return;
      }
      if (event === 'phx_leave') { channels.delete(topic); ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])); return; }
      if (ref) ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
    });
  });

  const handle = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    // ── Auth
    if (url.pathname === '/auth/v1/signup' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const problem = captchaProblem(db, body);
      if (problem) return route.fulfill(json(400, problem));
      const id = newId();
      db.signups.push({ id, email: body.email, data: body.data || {} });
      // What the on_auth_user_created trigger does with the details.
      db.tables.profiles.push({ id, email: body.email, full_name: body.data?.full_name ?? null, department: body.data?.department ?? null });
      if (body.data?.terms_version === TERMS_VERSION && body.data?.age_confirmed === true) {
        db.tables.user_consents.push({ user_id: id, terms_version: TERMS_VERSION, accepted_at: new Date().toISOString() });
      }
      return route.fulfill(json(200, sessionFor(id, body.email)));
    }
    if (url.pathname === '/auth/v1/recover' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const problem = captchaProblem(db, body);
      if (problem) return route.fulfill(json(400, problem));
      db.recoveries.push(body.email);
      return route.fulfill(json(200, {}));
    }
    if (url.pathname === '/auth/v1/user') {
      const user = userFromToken((req.headers().authorization || '').replace(/^Bearer /i, ''));
      if (!user || db.deletedAccount) return route.fulfill(json(401, { code: 'bad_jwt', message: 'invalid JWT' }));
      return route.fulfill(json(200, { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }));
    }
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(req.postData() || '{}');
      if (url.searchParams.get('grant_type') === 'password') {
        const problem = captchaProblem(db, body);
        if (problem) return route.fulfill(json(400, problem));
        const me = db.tables.profiles[0];
        if (body.email !== me.email || body.password !== 'Correct-Horse-1') return route.fulfill(json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', message: 'Invalid login credentials' }));
        return route.fulfill(json(200, sessionFor(db.U, me.email)));
      }
      const sub = String(body.refresh_token || '').replace('fake-refresh:', '');
      return route.fulfill(json(200, sessionFor(sub || db.U, 'me@test.dev')));
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill(json(200, {}));

    // ── Storage
    if (url.pathname.startsWith('/storage/v1/object/sign/') && method === 'POST') {
      const bucket = url.pathname.split('/').pop();
      const body = JSON.parse(req.postData() || '{}');
      const signed = (body.paths || []).map((path) => ({ path, error: null, signedURL: `/object/sign/${bucket}/${path}?token=fake` }));
      return route.fulfill(json(200, signed));
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/') || url.pathname.startsWith('/storage/v1/object/public/')) {
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: PNG_1PX });
    }
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'POST') {
      const [, bucket, ...rest] = url.pathname.replace('/storage/v1/object', '').split('/');
      const path = decodeURIComponent(rest.join('/'));
      const user = userFromToken((req.headers().authorization || '').replace(/^Bearer /i, ''));
      db.storage.push({ bucket, path, owner: user?.id ?? null, size: req.postDataBuffer()?.length ?? 0 });
      db.writes.push({ kind: 'upload', bucket, path });
      log(`upload ${bucket}/${path}`);
      return route.fulfill(json(200, { Id: newId(), Key: `${bucket}/${path}` }));
    }
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'DELETE') {
      const bucket = url.pathname.split('/').pop();
      const body = JSON.parse(req.postData() || '{}');
      const removed = [];
      for (const path of body.prefixes || []) {
        const index = db.storage.findIndex((o) => o.bucket === bucket && o.path === path);
        if (index >= 0) removed.push(...db.storage.splice(index, 1));
      }
      db.writes.push({ kind: 'remove', bucket, paths: body.prefixes || [] });
      return route.fulfill(json(200, removed.map((o) => ({ name: o.path, bucket_id: o.bucket }))));
    }

    // ── RPC
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      let args = {};
      try { args = method === 'GET' ? Object.fromEntries(url.searchParams) : JSON.parse(req.postData() || '{}'); } catch { /* no body */ }
      db.rpcCalls.push({ fn, args });
      log(`rpc ${fn}`);
      try {
        return route.fulfill(json(200, rpc(db, fn, args)));
      } catch (error) {
        if (!error.pg) throw error;
        return route.fulfill(json(error.pg.code === '42501' ? 403 : 400, error.pg));
      }
    }

    // ── Tables
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').pop();
      const params = url.searchParams;
      const prefer = req.headers().prefer || '';
      const wantsObject = (req.headers().accept || '').includes('vnd.pgrst.object');
      if ((method === 'GET' || params.has('select')) && readsPrivatePostText(table, params)) {
        return route.fulfill(json(403, { code: '42501', message: 'permission denied for table contents', details: null, hint: null }));
      }
      if (method === 'GET' || method === 'HEAD') {
        let rows = applyQuery(db, table, params);
        const total = rows.length;
        const offset = Number(params.get('offset') || 0);
        const limit = params.get('limit') ? Number(params.get('limit')) : undefined;
        rows = rows.slice(offset, limit !== undefined ? offset + limit : undefined);
        const headers = { ...cors, 'content-type': 'application/json' };
        if (prefer.includes('count=exact')) headers['content-range'] = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`;
        if (method === 'HEAD') return route.fulfill({ status: 200, headers, body: '' });
        const projected = project(db, rows, params.get('select'));
        if (wantsObject) {
          if (projected.length !== 1) return route.fulfill({ status: 406, headers, body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) });
          return route.fulfill({ status: 200, headers, body: JSON.stringify(projected[0]) });
        }
        return route.fulfill({ status: 200, headers, body: JSON.stringify(projected) });
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(req.postData() || '{}');
        const rows = applyQuery(db, table, params);
        for (const r of rows) { const old = { ...r }; Object.assign(r, patch); emit(table, 'UPDATE', { ...r }, old); }
        db.writes.push({ kind: 'update', table, patch, count: rows.length });
        if (prefer.includes('return=representation')) {
          if (wantsObject) return route.fulfill(rows.length === 1 ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'no rows' }));
          return route.fulfill(json(200, rows));
        }
        return route.fulfill({ status: 204, headers: cors, body: '' });
      }
      if (method === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        const list = Array.isArray(body) ? body : [body];
        const inserted = [];
        for (const r of list) {
          const row = { id: newId(), created_at: new Date().toISOString(), ...r };
          if (table === 'workspace_meetings') {
            // The database makes the room name (RG-22).
            row.room_name = `ResearchGram-${row.id.replace(/-/g, '')}`;
            row.meeting_url = `https://meet.jit.si/${row.room_name}`;
          }
          (db.tables[table] ||= []).push(row);
          inserted.push(row);
          emit(table, 'INSERT', row);
        }
        db.writes.push({ kind: 'insert', table, rows: inserted });
        log(`insert ${table}`);
        if (prefer.includes('return=representation')) return route.fulfill(json(201, wantsObject ? inserted[0] : inserted));
        return route.fulfill({ status: 201, headers: cors, body: '' });
      }
      if (method === 'DELETE') {
        const rows = applyQuery(db, table, params);
        db.tables[table] = (db.tables[table] || []).filter((r) => !rows.includes(r));
        db.writes.push({ kind: 'delete', table, count: rows.length });
        return route.fulfill({ status: 204, headers: cors, body: '' });
      }
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }

    return route.fulfill({ status: 404, headers: cors, body: '' });
  };

  await page.route('https://challenges.cloudflare.com/**', (route) => (db.turnstileDown
    ? route.abort('connectionfailed')
    : route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: FAKE_TURNSTILE })));

  await page.route(`${SUPABASE_URL}/**`, (route) => handle(route).catch((error) => {
    if (!/closed|disposed/i.test(String(error))) console.error('fake supabase:', error);
  }));

  return { emit };
}
