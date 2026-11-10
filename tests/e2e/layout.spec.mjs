// 10 Nov 2026: browser tests for the layout fixes of 10 Nov 2026: the profile
// card under a name in the feed, the cover buttons on /profile, the public
// profile (photo, left column), the message box on phones and the Menu button.
import { accessibilityProblems, expect, signIn, test } from './helpers.mjs';

test.beforeEach(async ({ context, db }) => {
  await signIn(context, db);
});

/** True when nothing is drawn over the element at that point (a share of its size). */
function onTop(locator, [fx, fy] = [0.5, 0.5]) {
  return locator.evaluate((el, [x, y]) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width * x, r.top + r.height * y);
    return Boolean(hit && (hit === el || el.contains(hit)));
  }, [fx, fy]);
}

test('the profile card under a name stays open while the pointer is on it', async ({ app }) => {
  await app.setViewportSize({ width: 1280, height: 800 });
  await app.goto('/feed');
  const name = app.getByRole('button', { name: 'Researcher 2', exact: true }).first();
  const viewProfile = app.getByRole('button', { name: 'View Profile' });

  await name.hover();
  await expect(viewProfile).toBeVisible();
  // Slowly down across the gap and onto the card, waiting longer than the
  // close delay at each stop.
  const n = await name.boundingBox();
  for (const below of [4, 40]) {
    await app.mouse.move(n.x + n.width / 2, n.y + n.height + below, { steps: 3 });
    await app.waitForTimeout(600);
    await expect(viewProfile).toBeVisible();
  }
  // Nothing cuts it off (before, the post's edges did).
  const card = viewProfile.locator('xpath=..');
  for (const point of [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]]) {
    expect(await onTop(card, point)).toBe(true);
  }
  expect(await accessibilityProblems(app)).toEqual([]);

  // Away from the name and the card, it closes; Escape closes it too.
  await app.mouse.move(5, 790, { steps: 4 });
  await expect(viewProfile).toBeHidden();
  await name.hover();
  await expect(viewProfile).toBeVisible();
  await app.keyboard.press('Escape');
  await expect(viewProfile).toBeHidden();
});

test('on a phone the profile card fits in the window', async ({ app }) => {
  await app.setViewportSize({ width: 360, height: 740 });
  await app.goto('/feed');
  await app.getByRole('button', { name: 'Researcher 2', exact: true }).first().hover();
  const card = app.getByRole('button', { name: 'View Profile' }).locator('xpath=..');
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});

for (const width of [1280, 390]) {
  test(`Save Cover and Cancel are not hidden behind the profile card (${width} px)`, async ({ app }) => {
    await app.setViewportSize({ width, height: 800 });
    await app.goto('/profile');
    await expect(app.getByRole('button', { name: 'Change Cover' })).toBeVisible();
    // Any real picture will do: a screenshot of part of the page.
    const png = await app.screenshot({ clip: { x: 0, y: 0, width: 200, height: 80 } });
    const picture = { name: 'cover.png', mimeType: 'image/png', buffer: png };
    const coverInput = app.locator('input[type="file"]').first();
    await coverInput.setInputFiles(picture);

    const save = app.getByRole('button', { name: 'Save Cover' });
    const cancel = app.getByRole('button', { name: 'Cancel' });
    await expect(save).toBeVisible();
    expect(await onTop(save)).toBe(true);
    expect(await onTop(cancel)).toBe(true);

    // Cancel puts the saved cover back; the same picture can be chosen again.
    await cancel.click();
    await expect(save).toBeHidden();
    await expect(app.locator('img[src="/images/default-cover.svg"]')).toHaveCount(1);
    await coverInput.setInputFiles(picture);
    await expect(save).toBeVisible();
  });
}

test('the public profile shows the whole photo, and its left column stops after its last card', async ({ app, db }) => {
  const me = db.tables.profiles[0];
  me.profile_pic_url = '/logos/academicorbit-logo.png';
  me.bio = 'A long introduction. '.repeat(50);
  for (let p = 1; p <= 10; p++) {
    db.tables.contents.push({ ...db.tables.contents[0], id: `00000000-0000-4000-8000-${String(2100 + p).padStart(12, '0')}`, title: `Long post ${p}`, content: 'Text. '.repeat(120), user_id: db.U });
  }
  await app.setViewportSize({ width: 1280, height: 800 });
  await app.goto(`/researchers/${db.U}`);

  const photo = app.getByRole('img', { name: 'Test Me' });
  await expect(photo).toBeVisible();
  // Before, the cover was drawn over the top half of the photo.
  expect(await onTop(photo, [0.5, 0.1])).toBe(true);

  const column = app.getByRole('region', { name: 'About this researcher' });
  await expect(column).toBeVisible();
  // Taller than the window: once its last card is in view it stays there,
  // 24 px above the bottom of the window, while the posts go on scrolling
  // (until the end of the posts).
  const { height, lastCardInView, postsEnd } = await column.evaluate((el) => ({
    height: el.offsetHeight,
    lastCardInView: el.getBoundingClientRect().bottom + window.scrollY - (window.innerHeight - 24),
    postsEnd: el.parentElement.getBoundingClientRect().bottom + window.scrollY - (window.innerHeight - 24),
  }));
  expect(height).toBeGreaterThan(800);
  expect(postsEnd - lastCardInView).toBeGreaterThan(400);
  for (const y of [lastCardInView + 100, postsEnd - 100]) {
    await app.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    const bottom = await column.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(Math.abs(bottom - (800 - 24))).toBeLessThanOrEqual(1);
  }
});

test('on a phone the bottom bar does not cover the message box', async ({ app }) => {
  await app.setViewportSize({ width: 390, height: 800 });
  await app.goto('/messages');
  const box = app.getByLabel('Message', { exact: true });
  await expect(box).toBeVisible();
  // An open chat has no bottom bar, so the box and Send can be used.
  await expect(app.getByRole('navigation', { name: 'Pages' })).toHaveCount(0);
  expect(await onTop(box)).toBe(true);
  expect(await onTop(app.getByRole('button', { name: 'Send message' }))).toBe(true);
  // The list of chats keeps the bottom bar.
  await app.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(app.getByRole('navigation', { name: 'Pages' })).toBeVisible();
});

test('on a narrow screen the Menu button shows the feed\'s side columns', async ({ app }) => {
  await app.setViewportSize({ width: 820, height: 800 });
  await app.goto('/feed');
  const menuButton = app.getByRole('button', { name: 'Menu', exact: true });
  await expect(menuButton).toBeVisible();
  await expect(app.getByRole('heading', { name: 'Trending Topics' })).toBeHidden();

  await menuButton.click();
  const menu = app.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('heading', { name: 'Trending Topics' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Quick Stats' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Project Workspace' })).toBeVisible();
  expect(await accessibilityProblems(app)).toEqual([]);
  await app.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();

  // Wide enough for the side columns: no Menu button.
  await app.setViewportSize({ width: 1280, height: 800 });
  await expect(menuButton).toBeHidden();
  await expect(app.getByRole('heading', { name: 'Trending Topics' })).toBeVisible();
});
