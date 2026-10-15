// Copies every stored file (all buckets) to a folder on this computer
// (Phase 5). A database backup (pg_dump) does not contain the files, and the
// Free plan keeps no backups, so this is the files half of a backup.
//
// Used by scripts/backupStorage.mjs; kept separate so tests can run it
// against a fake storage client.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const PAGE = 1000;

/** Every file in a bucket, folders included (Supabase lists one level at a time). */
export async function listBucket(storage, bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message || error}`);
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listBucket(storage, bucket, path)));
      else if (item.name !== '.emptyFolderPlaceholder') files.push({ path, size: item.metadata?.size ?? null });
    }
    if (!data || data.length < PAGE) return files;
  }
}

/** Where a stored file goes on disk, or null when its name could leave the folder. */
export function localPath(root, bucket, path) {
  const parts = String(path).split('/');
  if (!bucket || /[\\/]/.test(bucket) || parts.some((part) => part === '' || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) {
    return null;
  }
  const target = resolve(root, bucket, ...parts);
  const inside = relative(resolve(root), target);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null;
  return target;
}

/** True when `dir` is inside `project` (backups must never land in the repo). */
export function isInside(dir, project) {
  const inside = relative(resolve(project), resolve(dir));
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
}

async function inBatches(items, size, work) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(work));
  }
}

/**
 * Downloads every file of every bucket into `${dir}/${bucket}/...` and writes
 * manifest.json (path, size, SHA-256) next to them. Returns the summary.
 */
export async function backupStorage({ storage, dir, log = () => {}, parallel = 4 }) {
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw new Error(`list buckets: ${error.message || error}`);

  const manifest = { made_at: new Date().toISOString(), buckets: {} };
  const problems = [];
  let files = 0;
  let bytes = 0;

  for (const bucket of (buckets || []).map((b) => b.id || b.name).sort()) {
    const listed = await listBucket(storage, bucket);
    manifest.buckets[bucket] = [];
    log(`${bucket}: ${listed.length} file(s)`);

    await inBatches(listed, parallel, async (file) => {
      const target = localPath(dir, bucket, file.path);
      if (!target) {
        problems.push(`${bucket}/${file.path}: unsafe name, skipped`);
        return;
      }
      const { data: blob, error: downloadError } = await storage.from(bucket).download(file.path);
      if (downloadError || !blob) {
        problems.push(`${bucket}/${file.path}: ${downloadError?.message || 'no data'}`);
        return;
      }
      const body = Buffer.from(await blob.arrayBuffer());
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, body);
      files += 1;
      bytes += body.length;
      manifest.buckets[bucket].push({ path: file.path, size: body.length, sha256: createHash('sha256').update(body).digest('hex') });
    });

    manifest.buckets[bucket].sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  manifest.files = files;
  manifest.bytes = bytes;
  manifest.problems = problems;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { files, bytes, problems, buckets: Object.keys(manifest.buckets) };
}

