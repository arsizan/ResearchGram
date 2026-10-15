// Runs every tests/db/*.test.mjs in its own process and reports the result.
// Usage: npm run test:db
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
let failed = 0;

for (const file of files) {
  console.log(`\n=== ${file}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./report-errors.mjs', import.meta.url)), file], {
    cwd: dir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failed += 1;
    console.log(`=== ${file}: FAILED`);
  }
}

console.log(failed ? `\n${failed} of ${files.length} database test files failed.` : `\nAll ${files.length} database test files passed.`);
process.exit(failed ? 1 : 0);
