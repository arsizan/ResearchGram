// Phase 5: bot check on the sign-in forms, Terms and Privacy Policy with
// consent, the error log, ES256 sessions checked by the server itself, and
// smaller profile pictures.
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { COOKIE_NAME, SUPABASE_URL, TERMS_VERSION, sessionFor, uid } from './fake-supabase.mjs';
import { accessibilityProblems, expect, rpcCalls, signIn, test, waitForRpc } from './helpers.mjs';

const stats = async (request) => (await request.get(`${SUPABASE_URL}/test/stats`)).json();
const cookieFor = (session) => `${COOKIE_NAME}=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;

test.describe('bot check (Cloudflare Turnstile)', () => {
  test('login sends a token, and every attempt uses a new one', async ({ app, db }) => {
    await app.goto('/auth/login');
    await expect(app.getByTestId('security-check')).toHaveAttribute('data-token', /test-token-/);

    await app.getByLabel('Email').fill(db.tables.profiles[0].email);
    await app.getByLabel('Password').fill('Wrong-Horse-1');
    await app.getByRole('button', { name: 'Login' }).click();
    await expect(app.getByRole('alert').filter({ hasText: 'Email or password is incorrect' })).toBeVisible();

    await app.getByLabel('Password').fill('Correct-Horse-1');
    await app.getByRole('button', { name: 'Login' }).click();
    await expect(app).toHaveURL(/\/profile$/);

    const tokens = db.captcha.seen;
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => /^test-token-\d+$/.test(token))).toBe(true);
    expect(new Set(tokens).size, 'a token is never sent twice').toBe(2);
  });

  test('when the check cannot load, the form says so and sends nothing', async ({ app, db }) => {
    db.turnstileDown = true;
    await app.goto('/auth/login');
    await expect(app.getByRole('alert').filter({ hasText: 'security check could not load' })).toBeVisible();

    await app.getByLabel('Email').fill(db.tables.profiles[0].email);
    await app.getByLabel('Password').fill('Correct-Horse-1');
    await app.getByRole('button', { name: 'Login' }).click();
    await expect(app.getByRole('alert').filter({ hasText: 'Complete the security check first' })).toBeVisible();
    expect(db.captcha.seen).toHaveLength(0);

    // Back online: "Try again" loads it, and logging in works.
    db.turnstileDown = false;
    await app.getByRole('button', { name: 'Try the security check again' }).click();
    await expect(app.getByTestId('security-check')).toHaveAttribute('data-token', /test-token-/);
    await app.getByRole('button', { name: 'Login' }).click();
    await expect(app).toHaveURL(/\/profile$/);
  });

  test('a refused check on "forgot password" is explained, not hidden', async ({ app, db }) => {
    await app.goto('/auth/forgot-password');
    await app.getByLabel('Email').fill('someone@test.dev');
    db.captcha.forceFail = true;
    await app.getByRole('button', { name: 'Send reset link' }).click();
    await expect(app.getByRole('alert').filter({ hasText: 'security check failed or expired' })).toBeVisible();
    expect(db.recoveries).toHaveLength(0);

    db.captcha.forceFail = false;
    await app.getByRole('button', { name: 'Send reset link' }).click();
    await expect(app.getByRole('status')).toContainText('If an account exists');
    expect(db.recoveries).toEqual(['someone@test.dev']);
  });

  test('the sign-in forms with the check have no accessibility problems', async ({ app }) => {
    for (const path of ['/auth/login', '/auth/signup', '/auth/forgot-password']) {
      await app.goto(path);
      await expect(app.getByTestId('security-check')).toHaveAttribute('data-token', /test-token-/);
      expect(await accessibilityProblems(app), path).toEqual([]);
    }
  });

  test('pages allow the check script and frame, and nothing else new', async ({ request }) => {
    const csp = (await request.get('/auth/login')).headers()['content-security-policy'] || '';
    const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) || '';
    expect(directive('script-src')).toContain('https://challenges.cloudflare.com');
    expect(directive('frame-src')).toContain('https://challenges.cloudflare.com');
    expect(directive('connect-src')).not.toContain('cloudflare');
  });
});

test.describe('Terms, Privacy Policy and consent', () => {
  test('sign-up needs the age and Terms boxes, and stores the consent', async ({ app, db }) => {
    await app.goto('/auth/signup');
    await app.getByLabel('Full name').fill('New Person');
    await app.getByLabel('Email').fill('new.person@test.dev');
    await app.getByLabel('Password').fill('Brand-New-Pass-1');

    await app.getByRole('button', { name: 'Create Account' }).click();
    await expect(app.getByRole('alert').filter({ hasText: '18 or older' })).toBeVisible();
    await app.getByLabel('I am 18 years old or older.').check();
    await app.getByRole('button', { name: 'Create Account' }).click();
    await expect(app.getByRole('alert').filter({ hasText: 'Accept the Terms of Service' })).toBeVisible();
    expect(db.signups).toHaveLength(0);

    // The links open in a new tab, so the form is not lost.
    const terms = app.getByRole('link', { name: 'Terms of Service' });
    await expect(terms).toHaveAttribute('target', '_blank');
    await expect(app.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');

    await app.getByLabel(/I agree to the Terms of Service/).check();
    await app.getByRole('button', { name: 'Create Account' }).click();
    await expect(app).toHaveURL(/\/profile$/);

    expect(db.signups).toHaveLength(1);
    expect(db.signups[0].data).toMatchObject({ full_name: 'New Person', terms_version: TERMS_VERSION, age_confirmed: true });
    expect(db.tables.user_consents.some((c) => c.user_id === db.signups[0].id && c.terms_version === TERMS_VERSION)).toBe(true);
    expect(db.captcha.seen).toHaveLength(1);
  });

  test('the Privacy Policy and Terms are public, dated, and name the contact address', async ({ app }) => {
    for (const [path, heading] of [['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service']]) {
      const response = await app.goto(path);
      expect(response.status()).toBe(200);
      await expect(app).toHaveURL(new RegExp(`${path}$`));
      await expect(app.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(app.getByText('Last updated: 16 October 2026')).toBeVisible();
      await expect(app.getByRole('link', { name: 'help@researchgram.test' }).first()).toHaveAttribute('href', 'mailto:help@researchgram.test');
      expect(await accessibilityProblems(app), path).toEqual([]);
    }
    await app.goto('/');
    const footer = app.locator('footer').last();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });

  test('an older account accepts the Terms once, then continues', async ({ app, db, context }) => {
    db.tables.user_consents = [];
    await signIn(context, db);
    await app.goto('/feed');

    const dialog = app.getByRole('dialog', { name: 'Our Terms and Privacy Policy' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('I am 18 years old or older.')).toBeFocused();
    expect(await accessibilityProblems(app)).toEqual([]);

    await dialog.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(dialog.getByRole('alert')).toContainText('18 or older');
    await dialog.getByLabel('I am 18 years old or older.').check();
    await dialog.getByLabel('I agree to the Terms of Service and the Privacy Policy.').check();
    await dialog.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(dialog).toBeHidden();

    const [call] = await waitForRpc(db, 'accept_terms');
    expect(call.args).toEqual({ p_version: TERMS_VERSION, p_age_confirmed: true });
    await app.reload();
    await expect(app.getByRole('heading', { name: /Post number 1$/ })).toBeVisible();
    await expect(app.getByRole('dialog', { name: 'Our Terms and Privacy Policy' })).toHaveCount(0);
  });

  test('someone who does not agree can log out', async ({ app, db, context }) => {
    db.tables.user_consents = [{ user_id: db.U, terms_version: '2020-01-01', accepted_at: db.iso(1) }];
    await signIn(context, db);
    await app.goto('/network');
    const dialog = app.getByRole('dialog', { name: 'Our Terms and Privacy Policy' });
    await expect(dialog, 'an older version counts as not accepted').toBeVisible();
    await expect(dialog).toContainText('We updated our Terms of Service and our Privacy Policy on 16 October 2026.');
    // Escape does not dismiss it, and the page behind cannot be reached.
    await app.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Log out' }).click();
    await expect(app).toHaveURL(/\/$/);
    expect(rpcCalls(db, 'accept_terms')).toHaveLength(0);
  });

  test('the profile page stays open, to download data or delete the account', async ({ app, db, context }) => {
    db.tables.user_consents = [];
    await signIn(context, db);
    await app.goto('/feed');
    const dialog = app.getByRole('dialog', { name: 'Our Terms and Privacy Policy' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: 'your profile' }).click();
    await expect(app).toHaveURL(/\/profile$/);
    await expect(dialog).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Download my data' })).toBeVisible();
  });

  test('nobody is asked while the database expects another version', async ({ app, db, context }) => {
    // The app was deployed before the database change (or the other way round).
    db.databaseTermsVersion = '2099-01-01';
    db.tables.user_consents = [];
    await signIn(context, db);
    await app.goto('/feed');
    await waitForRpc(db, 'current_terms_version');
    await expect(app.getByRole('heading', { name: /Post number 1$/ })).toBeVisible();
    await expect(app.getByRole('dialog', { name: 'Our Terms and Privacy Policy' })).toHaveCount(0);
  });
});

test.describe('error log', () => {
  test('an error nothing caught is reported, without the part of the address after "?"', async ({ app, db, context }) => {
    await signIn(context, db);
    await app.goto('/network?tab=mine&code=secret');
    await app.evaluate(() => {
      setTimeout(() => {
        throw new TypeError('Boom from the test');
      });
    });
    const [call] = await waitForRpc(db, 'report_error');
    expect(call.args).toMatchObject({ p_source: 'browser', p_message: 'TypeError: Boom from the test', p_path: '/network' });
    expect(JSON.stringify(call.args)).not.toContain('secret');

    // The same error again on this page is not sent twice.
    await app.evaluate(() => {
      setTimeout(() => {
        throw new TypeError('Boom from the test');
      });
    });
    await app.waitForTimeout(500);
    expect(rpcCalls(db, 'report_error')).toHaveLength(1);
  });

  test('admins see the errors and mark them as fixed', async ({ app, db, context }) => {
    db.admins.add(db.U);
    db.adminErrors.push(
      { id: 1, source: 'browser', message: 'TypeError: x is undefined', stack: 'at feed (app.js:1:2)', path: '/feed', digest: null, user_agent: 'Chrome', signed_in: true, occurrences: 4, first_seen: db.iso(100), last_seen: db.iso(200), resolved_at: null },
      { id: 2, source: 'server', message: 'Error: database timeout', stack: null, path: '/api/research', digest: 'abc123', user_agent: 'route /api/research', signed_in: false, occurrences: 1, first_seen: db.iso(150), last_seen: db.iso(150), resolved_at: null },
    );
    await signIn(context, db);
    await app.goto('/admin');

    const section = app.getByRole('region', { name: /Errors/ });
    await expect(section.getByText('TypeError: x is undefined')).toBeVisible();
    await expect(section.getByText('2 open')).toBeVisible();
    await expect(section.getByText(/Server · \/api\/research/)).toBeVisible();

    await section.getByRole('button', { name: 'Mark as fixed' }).first().click();
    const [call] = await waitForRpc(db, 'admin_resolve_error');
    expect(call.args).toEqual({ p_id: 1 });
    await expect(section.getByText('TypeError: x is undefined')).toHaveCount(0);
    await expect(app.getByRole('region', { name: 'Audit log' }).getByText('Error marked as fixed')).toBeVisible();

    await section.getByRole('button', { name: 'Show fixed ones too' }).click();
    await expect(section.getByText('TypeError: x is undefined')).toBeVisible();
    expect(await accessibilityProblems(app)).toEqual([]);
  });
});

test('if the error log cannot be loaded, admins are told and can try again', async ({ app, db, context }) => {
  db.admins.add(db.U);
  db.adminErrorsFail = true;
  db.adminErrors.push({ id: 7, source: 'browser', message: 'ReferenceError: y is not defined', stack: null, path: '/feed', digest: null, user_agent: null, signed_in: true, occurrences: 1, first_seen: db.iso(100), last_seen: db.iso(100), resolved_at: null });
  await signIn(context, db);
  await app.goto('/admin');
  const section = app.getByRole('region', { name: /Errors/ });
  await expect(section.getByRole('alert')).toContainText('Could not load the error log.');
  await expect(section.getByText('No errors. Nice.')).toHaveCount(0);
  db.adminErrorsFail = false;
  await section.getByRole('button', { name: 'Try again' }).click();
  await expect(section.getByText('ReferenceError: y is not defined')).toBeVisible();
  await expect(section.getByText('1 open')).toBeVisible();
});

test.describe('sessions signed with asymmetric keys (ES256)', () => {
  // In order: the last test makes the published keys fail for a moment.
  test.describe.configure({ mode: 'serial' });

  test('the server checks them itself, without asking Supabase Auth', async ({ request }) => {
    const person = uid(424242);
    const response = await request.get('/feed', { headers: { cookie: cookieFor(sessionFor(person, 'es@test.dev', { es256: true })) }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect((await stats(request)).userChecks[person] ?? 0, 'no call to /auth/v1/user').toBe(0);

    // The older kind of session is still checked with Supabase Auth.
    const older = uid(424243);
    expect((await request.get('/feed', { headers: { cookie: cookieFor(sessionFor(older, 'hs@test.dev')) }, maxRedirects: 0 })).status()).toBe(200);
    expect((await stats(request)).userChecks[older]).toBeGreaterThanOrEqual(1);
  });

  test('a forged ES256 session counts as signed out', async ({ request }) => {
    const session = sessionFor(uid(424244), 'es@test.dev', { es256: true });
    const [head, , signature] = session.access_token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: uid(1), role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    session.access_token = `${head}.${forged}.${signature}`;
    session.refresh_token = 'revoked';
    const response = await request.get('/workspace', { headers: { cookie: cookieFor(session) }, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/auth\/login\?next=%2Fworkspace$/);
  });

  test('a token nobody can read counts as signed out', async ({ request }) => {
    const session = sessionFor(uid(424245), 'es@test.dev', { es256: true });
    session.access_token = `%%%.${session.access_token.split('.')[1]}.xyz`;
    session.refresh_token = 'revoked';
    const response = await request.get('/workspace', { headers: { cookie: cookieFor(session) }, maxRedirects: 0 });
    expect(response.status()).toBe(307);
  });

  test('when the published keys cannot be loaded, nobody is sent to the login page', async ({ request }) => {
    // A new key id makes the server fetch the keys; they answer 404 (a firewall in the way, say).
    await request.post(`${SUPABASE_URL}/test/jwks-status`, { data: '404' });
    try {
      const session = sessionFor(uid(424246), 'es@test.dev', { es256: true, kid: 'rotated-key-not-cached' });
      const response = await request.get('/feed', { headers: { cookie: cookieFor(session) }, maxRedirects: 0 });
      expect(response.status(), 'no redirect to login (the login page would send them back: a loop)').toBe(200);
    } finally {
      await request.post(`${SUPABASE_URL}/test/jwks-status`, { data: '200' });
    }
  });
});

// A noisy picture (so it compresses badly): 2400 x 1600 pixels, about 11.5 MB.
function bigPng(width = 2400, height = 1600) {
  const crc = (buf) => {
    let c, crcVal = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crcVal ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcVal = (crcVal >>> 8) ^ c;
    }
    return (crcVal ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8-bit RGB
  const raw = randomBytes((width * 3 + 1) * height);
  for (let row = 0; row < height; row++) raw[row * (width * 3 + 1)] = 0; // filter byte: none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('a large profile picture is made smaller before upload', async ({ app, db, context }) => {
  await signIn(context, db);
  await app.goto('/profile');
  const png = bigPng();
  expect(png.length).toBeGreaterThan(5 * 1024 * 1024);

  const input = app.getByRole('button', { name: 'Change profile photo' }).locator('xpath=following-sibling::input[@type="file"][1]');
  await input.setInputFiles({ name: 'holiday-photo.png', mimeType: 'image/png', buffer: png });
  await app.getByRole('button', { name: 'Upload Photo' }).click();
  await expect(app.getByText('Profile picture updated!')).toBeVisible();

  const upload = db.storage.find((o) => o.bucket === 'profile-avatars');
  expect(upload.path).toMatch(new RegExp(`^${db.U}/profile-\\d+\\.webp$`));
  expect(upload.size).toBeLessThan(png.length / 10);
  expect(db.tables.profiles[0].profile_pic_url).toContain('.webp');
});
