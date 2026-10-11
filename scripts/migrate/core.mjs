/**
 * The Sydney -> Mumbai move, written against injected Supabase clients so it can be
 * tested without touching a real project. scripts/migrateToMumbai.mjs is the CLI.
 *
 * The source client is only ever read from. Every write goes to the target.
 */
import { randomUUID } from "node:crypto";

// Parents before children, so every foreign key already has its row.
export const TABLE_ORDER = [
  "profiles",
  "contents",
  "content_attachments",
  "paper_extracted_images",
  "content_authors",
  "comments",
  "saved_posts",
  "hidden_posts",
  "post_reports",
  "paper_access_requests",
  "research_requests",
  "profile_requests",
  "user_connections",
  "workspaces",
  "workspace_members",
  "workspace_tasks",
  "workspace_files",
  "workspace_milestones",
  "workspace_meetings",
  "workspace_recordings",
  "workspace_updates",
  "conversations",
  "conversation_members",
  "messages",
  "notifications",
  "search_events",
  "profile_view_events",
];

export const COPY_BUCKETS = ["content-files", "content-images", "profile-avatars", "restricted-papers"];
export const WORKSPACE_BUCKET = "workspace-files";
const LEGACY_WORKSPACE_PREFIX = "workspace/";
const PAGE = 1000;
const BATCH = 500;

export function projectRef(url) {
  return new URL(url).hostname.split(".")[0];
}

/** Supabase's "Download CSV" of a one-cell query, or the raw JSON array. */
export function parseUsersFile(text) {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);

  const newline = trimmed.indexOf("\n");
  if (newline === -1) throw new Error("Users file has no data row.");
  let cell = trimmed.slice(newline + 1).trim();
  if (cell.startsWith('"')) {
    if (!cell.endsWith('"')) throw new Error("Users file: unterminated quoted cell.");
    cell = cell.slice(1, -1).replace(/""/g, '"');
  }
  const users = JSON.parse(cell);
  if (!Array.isArray(users)) throw new Error("Users file does not contain a JSON array.");
  return users;
}

/** workspace/{userId}/{workspaceId}/{file} -> {workspaceId}/{userId}/{file} */
export function legacyWorkspacePath(path) {
  const [prefix, userId, workspaceId, ...rest] = path.split("/");
  if (prefix !== "workspace" || !userId || !workspaceId || rest.length === 0) return null;
  return `${workspaceId}/${userId}/${rest.join("/")}`;
}

// Same rule as the notifications_link_url_internal constraint.
export function isInternalLink(link) {
  return link == null || /^\/([^/\\]|$)/.test(link);
}

export function rewriteUrls(row, fromUrl, toUrl) {
  const text = JSON.stringify(row);
  return text.includes(fromUrl) ? JSON.parse(text.split(fromUrl).join(toUrl)) : row;
}

function fail(step, error) {
  const message = error?.message || String(error);
  throw new Error(`${step}: ${message}`);
}

async function readTable(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select("*").order("id").range(from, from + PAGE - 1);
    if (error) fail(`read ${table}`, error);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function countTable(client, table) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) fail(`count ${table}`, error);
  return count ?? 0;
}

async function listAll(client, bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) fail(`list ${bucket}/${prefix}`, error);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listAll(client, bucket, path)));
      else if (item.name !== ".emptyFolderPlaceholder") files.push({ path, mimetype: item.metadata?.mimetype });
    }
    if (data.length < PAGE) return files;
  }
}

async function listAllUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) fail("list accounts", error);
    users.push(...data.users);
    if (data.users.length < PAGE) return users;
  }
}

async function bucketExists(client, bucket) {
  const { data, error } = await client.storage.getBucket(bucket);
  return !error && Boolean(data);
}

/**
 * @param {object} o
 * @param {object} o.source        Supabase client for Sydney (secret key) - read only
 * @param {object} o.target        Supabase client for Mumbai (secret key)
 * @param {string} o.sourceUrl
 * @param {string} o.targetUrl
 * @param {Array}  o.users         parsed users file
 * @param {string} o.confirmRef    must equal the target project ref to allow writes
 * @param {boolean} o.dryRun
 * @param {(line: string) => void} o.log
 */
export async function migrate({ source, target, sourceUrl, targetUrl, users, confirmRef, dryRun, log }) {
  // ---------- 1. safety ----------
  const sourceRef = projectRef(sourceUrl);
  const targetRef = projectRef(targetUrl);
  if (sourceRef === targetRef) throw new Error("Source and target are the same project. Stopping.");
  if (!dryRun && confirmRef !== targetRef) {
    throw new Error(`CONFIRM_WIPE_TARGET must be "${targetRef}" to empty and fill the target. Stopping.`);
  }
  if (!Array.isArray(users) || users.length === 0) throw new Error("No accounts in the users file.");

  log(`Source ${sourceRef}  ->  target ${targetRef}${dryRun ? "  (dry run: nothing is written)" : ""}`);

  // ---------- 2. read the source ----------
  const data = {};
  for (const table of TABLE_ORDER) data[table] = await readTable(source, table);
  const totalRows = TABLE_ORDER.reduce((n, t) => n + data[t].length, 0);
  log(`Read ${totalRows} rows from ${TABLE_ORDER.length} tables, ${users.length} accounts.`);

  const accountIds = new Set(users.map((u) => u.id));
  const orphans = data.profiles.filter((p) => !accountIds.has(p.id));
  if (orphans.length > 0) {
    throw new Error(`${orphans.length} profile(s) have no account in the users file (${orphans.map((p) => p.id).join(", ")}). Re-export the users and run again.`);
  }

  const sourceFiles = {};
  for (const bucket of COPY_BUCKETS) {
    sourceFiles[bucket] = (await bucketExists(source, bucket)) ? await listAll(source, bucket) : [];
  }
  const legacyFiles = sourceFiles["content-files"].filter((f) => f.path.startsWith(LEGACY_WORKSPACE_PREFIX));
  log(`Found ${Object.values(sourceFiles).reduce((n, f) => n + f.length, 0)} files (${legacyFiles.length} old workspace files will move to the private bucket).`);

  if (!(await bucketExists(target, WORKSPACE_BUCKET))) {
    throw new Error(`Target has no "${WORKSPACE_BUCKET}" bucket. Run the three SQL migrations on the target first.`);
  }
  await countTable(target, "profiles"); // proves the target schema exists

  if (dryRun) {
    for (const table of TABLE_ORDER) log(`  ${table.padEnd(24)} ${data[table].length}`);
    log("Dry run finished. Nothing was changed.");
    return { ok: true, dryRun: true };
  }

  // ---------- 3. empty the target ----------
  for (const table of [...TABLE_ORDER].reverse()) {
    const { error } = await target.from(table).delete().not("id", "is", null);
    if (error) fail(`empty ${table}`, error);
  }
  const oldAccounts = await listAllUsers(target);
  for (const account of oldAccounts) {
    const { error } = await target.auth.admin.deleteUser(account.id);
    if (error) fail(`delete test account ${account.email}`, error);
  }
  for (const bucket of [...COPY_BUCKETS, WORKSPACE_BUCKET]) {
    if (!(await bucketExists(target, bucket))) continue;
    const paths = (await listAll(target, bucket)).map((f) => f.path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await target.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) fail(`empty bucket ${bucket}`, error);
    }
  }
  log(`Emptied the target (${oldAccounts.length} test account(s) removed).`);

  // ---------- 4. accounts, same id and password hash ----------
  for (const u of users) {
    const attrs = {
      id: u.id,
      email: u.email,
      email_confirm: Boolean(u.email_confirmed),
      user_metadata: u.user_metadata || {},
    };
    if (u.password_hash) attrs.password_hash = u.password_hash;
    const { error } = await target.auth.admin.createUser(attrs);
    if (error) fail(`create account ${u.email}`, error);
  }
  log(`Created ${users.length} accounts with their existing passwords.`);

  // ---------- 5. tables ----------
  const fixedLinks = [];
  let addedMembers = 0;
  for (const table of TABLE_ORDER) {
    let rows = data[table].map((row) => rewriteUrls(row, sourceUrl, targetUrl));

    if (table === "workspace_files") {
      rows = rows.map((row) => {
        const moved = row.storage_path ? legacyWorkspacePath(row.storage_path) : null;
        return moved ? { ...row, storage_path: moved, file_url: null } : row;
      });
    }
    if (table === "notifications") {
      rows = rows.map((row) => {
        if (isInternalLink(row.link_url)) return row;
        fixedLinks.push(row.id);
        return { ...row, link_url: null };
      });
    }
    if (table === "conversation_members") {
      // Chats started from Network or Requests before the RG-10 fix have no member
      // rows. Under the new rules only members can read a chat, so add them.
      const have = new Set(rows.map((m) => `${m.conversation_id}:${m.user_id}`));
      const now = new Date().toISOString();
      for (const c of data.conversations) {
        for (const userId of new Set([c.participant_one_id, c.participant_two_id])) {
          if (!userId || have.has(`${c.id}:${userId}`)) continue;
          have.add(`${c.id}:${userId}`);
          rows.push({ id: randomUUID(), conversation_id: c.id, user_id: userId, role: "member", last_read_at: now, muted: false, joined_at: now });
          addedMembers += 1;
        }
      }
    }

    // A reply can point at a message in a later batch, so links are set afterwards.
    const replies = table === "messages" ? rows.filter((m) => m.reply_to_message_id) : [];
    if (replies.length > 0) rows = rows.map((m) => ({ ...m, reply_to_message_id: null }));

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      // The sign-up trigger already made a bare profile for each account; fill it in.
      const { error } =
        table === "profiles"
          ? await target.from(table).upsert(batch, { onConflict: "id" })
          : await target.from(table).insert(batch);
      if (error) fail(`copy ${table}`, error);
    }

    for (const m of replies) {
      const { error } = await target
        .from("messages")
        .update({ reply_to_message_id: m.reply_to_message_id })
        .eq("id", m.id);
      if (error) fail("restore message replies", error);
    }
  }
  log(`Copied ${totalRows} rows.`);
  if (addedMembers) log(`Added ${addedMembers} missing chat membership(s) for old Network/Requests chats.`);
  if (fixedLinks.length) log(`Cleared ${fixedLinks.length} notification link(s) that pointed outside the app.`);

  // ---------- 6. files ----------
  let copied = 0;
  for (const bucket of COPY_BUCKETS) {
    for (const file of sourceFiles[bucket]) {
      const { data: blob, error: downloadError } = await source.storage.from(bucket).download(file.path);
      if (downloadError) fail(`download ${bucket}/${file.path}`, downloadError);

      const legacy = bucket === "content-files" ? legacyWorkspacePath(file.path) : null;
      const toBucket = legacy ? WORKSPACE_BUCKET : bucket;
      const toPath = legacy || file.path;

      const { error: uploadError } = await target.storage
        .from(toBucket)
        .upload(toPath, blob, { upsert: true, contentType: file.mimetype || blob.type || undefined });
      if (uploadError) fail(`upload ${toBucket}/${toPath}`, uploadError);
      copied += 1;
    }
  }
  log(`Copied ${copied} files.`);

  // ---------- 7. verify ----------
  const problems = [];
  for (const table of TABLE_ORDER) {
    const n = await countTable(target, table);
    const expected = data[table].length + (table === "conversation_members" ? addedMembers : 0);
    if (n !== expected) problems.push(`${table}: expected ${expected}, target ${n}`);
  }
  const accounts = await listAllUsers(target);
  if (accounts.length !== users.length) problems.push(`accounts: source ${users.length}, target ${accounts.length}`);
  const expectedFiles = {
    "content-files": sourceFiles["content-files"].length - legacyFiles.length,
    "content-images": sourceFiles["content-images"].length,
    "profile-avatars": sourceFiles["profile-avatars"].length,
    "restricted-papers": sourceFiles["restricted-papers"].length,
    [WORKSPACE_BUCKET]: legacyFiles.length,
  };
  for (const [bucket, expected] of Object.entries(expectedFiles)) {
    const n = (await listAll(target, bucket)).length;
    if (n !== expected) problems.push(`files in ${bucket}: expected ${expected}, target ${n}`);
  }

  if (problems.length > 0) {
    for (const p of problems) log(`  FAIL  ${p}`);
    return { ok: false, problems };
  }
  log(`  PASS  ${TABLE_ORDER.length} tables, ${users.length} accounts and ${copied} files match.`);
  return { ok: true, problems: [] };
}
