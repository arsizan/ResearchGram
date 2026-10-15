// The part of Supabase the Next.js server itself talks to during the tests:
// proxy.ts checks the session (GET /auth/v1/user) and may refresh it
// (POST /auth/v1/token). The browser's requests to the same address are
// answered inside Playwright by fake-supabase.mjs instead.
import { createServer } from 'node:http';
import { SUPABASE_URL, sessionFor, userFromToken } from './fake-supabase.mjs';

const { port, hostname } = new URL(SUPABASE_URL);

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url, SUPABASE_URL);
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    if (url.pathname === '/health') return send(res, 200, { ok: true });

    if (url.pathname === '/auth/v1/user') {
      const user = userFromToken((req.headers.authorization || '').replace(/^Bearer /i, ''));
      if (!user) return send(res, 401, { code: 'bad_jwt', message: 'invalid JWT' });
      return send(res, 200, { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {} });
    }

    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* empty */ }
      // Supabase under load: a rate limit, or no answer for a long time.
      if (body.refresh_token === 'rate-limited') return send(res, 429, { code: 'over_request_rate_limit', message: 'Request rate limit reached' });
      if (body.refresh_token === 'slow') {
        return setTimeout(() => {
          if (!res.destroyed && !res.writableEnded) send(res, 503, { message: 'upstream timeout' });
        }, 15000);
      }
      const sub = String(body.refresh_token || '').replace('fake-refresh:', '');
      if (!/^[0-9a-f-]{36}$/.test(sub)) return send(res, 400, { code: 'refresh_token_not_found', message: 'Invalid Refresh Token' });
      return send(res, 200, sessionFor(sub, 'me@test.dev'));
    }

    if (url.pathname === '/auth/v1/.well-known/jwks.json') return send(res, 200, { keys: [] });
    if (url.pathname === '/auth/v1/logout') return send(res, 204);
    return send(res, 404, { message: 'not found' });
  });
}).listen(Number(port), hostname, () => {
  console.log(`fake Supabase auth for the Next.js server on ${SUPABASE_URL}`);
});
