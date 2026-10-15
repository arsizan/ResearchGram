// Builds the app for the browser tests (into .next-e2e, so a normal build is
// not touched) and starts it. Playwright runs this through webServer.
// E2E_SKIP_BUILD=1 reuses the last test build.
import { spawn, spawnSync } from 'node:child_process';
import { SUPABASE_URL } from './fake-supabase.mjs';

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_ORCID_CLIENT_ID: 'APP-E2E-TEST',
  NEXT_PUBLIC_ORCID_BASE_URL: 'https://sandbox.orcid.org',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
};

const port = process.env.E2E_PORT || '3100';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!process.env.E2E_SKIP_BUILD) {
  const build = spawnSync(npx, ['next', 'build'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(npx, ['next', 'start', '-p', port, '-H', '127.0.0.1'], { env, stdio: 'inherit', shell: process.platform === 'win32' });
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => process.exit(code ?? 0));
