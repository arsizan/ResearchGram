import { COOKIE_NAME, SUPABASE_URL, sessionFor } from './fake-supabase.mjs';
import { expect, signIn, test } from './helpers.mjs';

test.describe('sign-in check on the server (RG-01)', () => {
  test('a signed-out visitor is sent to the login page, and back after logging in', async ({ app, db }) => {
    await app.goto('/messages?conversation=abc');
    await expect(app).toHaveURL(/\/auth\/login\?next=%2Fmessages%3Fconversation%3Dabc$/);

    await app.getByLabel('Email').fill(db.tables.profiles[0].email);
    await app.getByLabel('Password').fill('Correct-Horse-1');
    await app.getByRole('button', { name: 'Login' }).click();

    await expect(app).toHaveURL(/\/messages\?conversation=abc$/);
    const cookies = await app.context().cookies();
    expect(cookies.some((c) => c.name === COOKIE_NAME && c.value.startsWith('base64-'))).toBe(true);
  });

  test('public pages and API routes are not redirected', async ({ app, request }) => {
    await app.goto('/');
    await expect(app).toHaveURL(/\/$/);
    await app.goto('/auth/signup');
    await expect(app).toHaveURL(/\/auth\/signup$/);

    // API routes answer for themselves (JSON, no login redirect).
    const response = await request.get('/api/research?q=graph', { maxRedirects: 0 });
    expect(response.status()).toBe(401);
  });

  test('a signed-in visitor opens private pages directly', async ({ app, db, context }) => {
    await signIn(context, db);
    const response = await app.goto('/feed');
    expect(response.status()).toBe(200);
    await expect(app).toHaveURL(/\/feed$/);
    await expect(app.getByRole('heading', { name: /Post number 1$/ })).toBeVisible();
  });

  test('a session that is no longer valid counts as signed out', async ({ app, context }) => {
    const broken = sessionFor('00000000-0000-4000-8000-000000000001', 'me@test.dev');
    broken.access_token = broken.access_token.replace(/\.c2lnbmF0dXJl$/, '.d3Jvbmc');
    broken.refresh_token = 'revoked';
    await context.addCookies([{ name: COOKIE_NAME, value: `base64-${Buffer.from(JSON.stringify(broken)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
    await app.goto('/workspace');
    await expect(app).toHaveURL(/\/auth\/login\?next=%2Fworkspace$/);
  });

  test('a rate-limited or slow Supabase does not sign anyone out', async ({ request }) => {
    for (const refreshToken of ['rate-limited', 'slow']) {
      // An expired access token, so the server has to refresh the session.
      const session = sessionFor('00000000-0000-4000-8000-000000000001', 'me@test.dev', { expiresIn: -60 });
      session.refresh_token = refreshToken;
      const cookie = `${COOKIE_NAME}=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;

      const started = Date.now();
      const response = await request.get('/feed', { headers: { cookie }, maxRedirects: 0 });
      expect(response.status(), refreshToken).toBe(200);
      expect(Date.now() - started, `${refreshToken}: the check gives up after a few seconds`).toBeLessThan(8000);
      expect(response.headers()['set-cookie'] ?? '', `${refreshToken}: the session cookie is kept`).not.toContain(COOKIE_NAME);
    }
  });

  test('a signed-in visitor on the login page goes straight on', async ({ app, db, context }) => {
    await signIn(context, db);
    await app.goto('/auth/login?next=/network');
    await expect(app).toHaveURL(/\/network$/);
  });

  test('"next" cannot lead to another site, however it is written', async ({ app, db, context }) => {
    await signIn(context, db);
    for (const next of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/.//evil.example', 'https://evil.example/']) {
      await app.goto(`/auth/login?next=${encodeURIComponent(next)}`);
      await expect(app, JSON.stringify(next)).toHaveURL(/^http:\/\/127\.0\.0\.1:3100\/profile$/);
    }
  });

  test('logging in opens the page even when the app had remembered its redirect to login', async ({ app, db }) => {
    // Signed out on a public page that links to /feed: the app fetches /feed
    // ahead of time and gets "go to login" back.
    const prefetched = app.waitForRequest((r) => new URL(r.url()).pathname === '/feed');
    await app.goto('/auth/no-such-page');
    await prefetched;
    await app.getByRole('link', { name: 'Go to feed' }).click();
    await expect(app).toHaveURL(/\/auth\/login\?next=%2Ffeed$/);

    await app.getByLabel('Email').fill(db.tables.profiles[0].email);
    await app.getByLabel('Password').fill('Correct-Horse-1');
    await app.getByRole('button', { name: 'Login' }).click();
    await expect(app).toHaveURL(/\/feed$/);
  });

  test('a session saved by the previous version (localStorage) is moved into cookies', async ({ app, db, context }) => {
    const legacyKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const session = sessionFor(db.U, 'me@test.dev');
    await context.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('seeded', '1');
      }
    }, [legacyKey, JSON.stringify(session)]);

    // No cookie yet: the server sends the visitor to the login page, which
    // moves the old session and continues to the page that was asked for.
    await app.goto('/feed');
    await expect(app).toHaveURL(/\/feed$/);
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === COOKIE_NAME)).toBe(true);
    expect(await app.evaluate((key) => localStorage.getItem(key), legacyKey)).toBeNull();
  });
});

test('security headers are sent with every page', async ({ request }) => {
  const response = await request.get('/auth/login');
  const headers = response.headers();
  const csp = headers['content-security-policy'] || '';
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain(`connect-src 'self' ${SUPABASE_URL}`);
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain('https://meet.jit.si');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('microphone=(self "https://meet.jit.si")');
  expect(headers['x-powered-by']).toBeUndefined();
});
