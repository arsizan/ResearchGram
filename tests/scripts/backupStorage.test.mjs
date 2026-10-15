// The stored-files backup (scripts/backupStorage.mjs) against a fake storage:
// every bucket and folder is copied, names cannot leave the backup folder,
// failures are reported, and the manifest matches what was written.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupStorage, isInside, listBucket, localPath } from '../../scripts/backup/storage.mjs';

let passed = 0;
const ok = () => { passed += 1; };

const files = {
  'profile-avatars': { 'u1/profile-1.webp': 'avatar one', 'u2/profile-2.webp': 'avatar two' },
  'chat-attachments': { 'c1/u1/a/report.pdf': 'pdf bytes', 'c1/u1/b/voice.webm': 'voice', '../escape.txt': 'nope', 'bad\\name.txt': 'nope' },
  'workspace-files': { 'w1/u1/plan.docx': 'docx', 'w1/u1/broken.bin': null },
};
// Enough files in one folder to need a second page.
for (let i = 0; i < 1005; i++) files['profile-avatars'][`many/${String(i).padStart(4, '0')}.txt`] = `n${i}`;

function fakeStorage() {
  return {
    listBuckets: async () => ({ data: Object.keys(files).map((id) => ({ id, name: id })), error: null }),
    from(bucket) {
      return {
        async list(prefix, { limit, offset }) {
          const level = new Map();
          for (const path of Object.keys(files[bucket])) {
            if (prefix && !path.startsWith(`${prefix}/`)) continue;
            const rest = prefix ? path.slice(prefix.length + 1) : path;
            const [name, ...more] = rest.split('/');
            level.set(name, more.length ? { name, id: null } : { name, id: `id-${name}`, metadata: { size: (files[bucket][path] || '').length } });
          }
          const all = [...level.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
          return { data: all.slice(offset, offset + limit), error: null };
        },
        async download(path) {
          const body = files[bucket][path];
          if (body === null || body === undefined) return { data: null, error: { message: 'Object not found' } };
          return { data: new Blob([body]), error: null };
        },
      };
    },
  };
}

const root = await mkdtemp(join(tmpdir(), 'rg-backup-'));
try {
  assert.equal((await listBucket(fakeStorage(), 'profile-avatars')).length, 1007, 'all pages and folders listed'); ok();

  assert.equal(localPath(root, 'b', '../x'), null); ok();
  assert.equal(localPath(root, 'b', 'a/../../x'), null); ok();
  assert.equal(localPath(root, 'b', 'a\\x'), null); ok();
  assert.equal(localPath(root, '../b', 'x'), null); ok();
  assert.equal(localPath(root, 'b', ''), null); ok();
  assert.equal(localPath(root, 'b', 'u1/p.webp'), join(root, 'b', 'u1', 'p.webp')); ok();
  assert.equal(isInside('/repo/backups', '/repo'), true); ok();
  assert.equal(isInside('/repo', '/repo'), true); ok();
  assert.equal(isInside('/elsewhere/backups', '/repo'), false); ok();
  assert.equal(isInside('/repo-backups', '/repo'), false, 'a sibling folder with a similar name is outside'); ok();

  const lines = [];
  const result = await backupStorage({ storage: fakeStorage(), dir: root, log: (line) => lines.push(line) });
  assert.equal(result.files, 1007 + 2 + 1, 'every safe, downloadable file'); ok();
  assert.equal(result.problems.length, 3, 'two unsafe names and one failed download'); ok();
  assert.ok(result.problems.some((p) => p.includes('escape.txt') && p.includes('unsafe'))); ok();
  assert.ok(result.problems.some((p) => p.includes('broken.bin') && p.includes('Object not found'))); ok();
  assert.equal(await readFile(join(root, 'chat-attachments', 'c1', 'u1', 'a', 'report.pdf'), 'utf8'), 'pdf bytes'); ok();
  await assert.rejects(stat(join(root, 'escape.txt')), 'nothing written outside the folder'); ok();

  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files, result.files); assert.equal(manifest.problems.length, 3); ok();
  const entry = manifest.buckets['profile-avatars'].find((f) => f.path === 'u1/profile-1.webp');
  assert.equal(entry.sha256, createHash('sha256').update('avatar one').digest('hex')); ok();
  assert.deepEqual(lines.slice(0, 3), ['chat-attachments: 4 file(s)', 'profile-avatars: 1007 file(s)', 'workspace-files: 2 file(s)']); ok();
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log(`STORAGE BACKUP: all buckets and folders copied, unsafe names refused, failures reported, manifest checked (${passed})`);
