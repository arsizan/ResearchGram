// Runs one test file. PGlite errors carry its whole minified source in the
// stack; print the database message and where it happened instead.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const show = (error) => {
  console.error('ERROR:', error?.message);
  for (const key of ['code', 'detail', 'hint', 'where', 'position']) {
    if (error?.[key]) console.error(`  ${key}: ${error[key]}`);
  }
  const frames = String(error?.stack || '').split('\n').filter((line) => line.includes('.test.mjs'));
  if (frames.length) console.error(frames.slice(0, 3).join('\n'));
  process.exit(1);
};
process.on('uncaughtException', show);
process.on('unhandledRejection', show);
// pathToFileURL also gives a correct address for Windows paths (C:\...).
await import(pathToFileURL(resolve(process.argv[2])).href);
