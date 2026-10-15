/**
 * Copies every stored file (avatars, papers, chat and workspace files) from
 * Supabase Storage to a folder on this computer (Phase 5). Run it with the
 * weekly database backup (docs/runbook.md): pg_dump does not contain files.
 *
 *   node --env-file=.env.backup scripts/backupStorage.mjs
 *
 * .env.backup (git-ignored, stays on this computer only):
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY=sb_secret_...   Project Settings -> API Keys -> Secret keys
 *   BACKUP_DIR=D:\ResearchGram-backups\files
 *
 * The secret key can read every file: never put it in git, Vercel or a chat.
 * Each run writes a new dated folder inside BACKUP_DIR with manifest.json
 * (every file with its size and SHA-256). The files contain private papers and
 * messages: keep the folder private, like the database backups.
 */
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { backupStorage, isInside } from './backup/storage.mjs';

const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'BACKUP_DIR'].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing in .env.backup: ${missing.join(', ')}`);
  process.exit(1);
}

if (isInside(process.env.BACKUP_DIR, process.cwd())) {
  console.error('BACKUP_DIR is inside the project folder. Choose a folder outside it, so backups can never end up in git.');
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dir = join(process.env.BACKUP_DIR, `files-${stamp}`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const result = await backupStorage({ storage: supabase.storage, dir, log: (line) => console.log(line) });
  console.log(`\nSaved ${result.files} file(s), ${(result.bytes / 1024 / 1024).toFixed(1)} MB, to ${dir}`);
  if (result.problems.length > 0) {
    console.error(`\n${result.problems.length} file(s) could not be saved:`);
    result.problems.forEach((line) => console.error(`  ${line}`));
    process.exit(1);
  }
} catch (error) {
  console.error(`\nSTOPPED: ${error.message}`);
  process.exit(1);
}
