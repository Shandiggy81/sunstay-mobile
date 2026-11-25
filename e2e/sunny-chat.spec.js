import { test, expect } from '@playwright/test';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';
import { weather } from './fixtures/weather.js';
import { nameContainsLabel } from '../src/utils/labelInName.js';

const NOW = new Date('2026-10-19T08:06:00Z'); // 7:06pm Melbourne (AEDT)
const forecast = structuredClone(weather);
Object.assign(forecast.current, { time: '2026-10-19T19:06', temperature_2m: 16, cloud_cover: 15 });
const remoteReply = 'Fixture reply: try a rooftop in Fitzroy.';
const launcher = page => page.getByRole('button', { name: 'Ask Sunny', exact: true });
const quickReplies = dialog => dialog.getByRole('group', { name: 'Quick replies' }).getByRole('button');

async function boot(page, baseURL) {
  const posts = [];
  await page.clock.setFixedTime(NOW);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: forecast });
    if (url.origin === FAKE_SUPABASE_URL && url.pathname === '/functions/v1/chat-sunny') {
      const headers = { 'access-control-allow-origin': baseURL, 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, apikey, authorization' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() === 'POST') {
        posts.push(request.postDataJSON());
        return route.fulfill({ json: { reply: remoteReply, toolCalls: [] }, headers });
      }
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.getByText('16°', { exact: true }).first()).toBeVisible();
  return posts;
}

async function openChat(page) {
  await launcher(page).click();
  const dialog = page.getByRole('dialog', { name: 'Ask Sunny', exact: true });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('heading', { name: 'Ask Sunny', exact: true })).toBeVisible();
  await expect(dialog.getByText('Melbourne now: 16°, mostly clear, light breeze')).toBeVisible();
  await expect(dialog.getByText("G'day! I'm Sunny. What kind of spot are you after?")).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Message Sunny' })).toBeFocused();
  await expect(quickReplies(dialog)).toHaveCount(4);
  await expect(quickReplies(dialog).first()).toHaveText('Sunset spots');
  return dialog;
}

async function capture(page, testInfo, name) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectSizedControls(dialog) {
  for (const control of await dialog.getByRole('button').or(dialog.getByRole('textbox')).all()) {
    const box = await control.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test('Sunny replies locally to chip and fireplace asks and sends only the detailed ask', async ({ page, baseURL }, testInfo) => {
  const posts = await boot(page, baseURL);
  const dialog = await openChat(page);
  const log = dialog.getByRole('log');
  const input = dialog.getByRole('textbox', { name: 'Message Sunny' });
  const lists = log.getByRole('list', { name: 'Suggested venues' });
  const send = async text => {
    await input.fill(text);
    await input.press('Enter');
  };
  await capture(page, testInfo, 'sunny-empty-390');

  await send('Somewhere with a fireplace tonight?');
  await expect(log.getByText(/^13 venues list a fireplace, including these three\./)).toBeVisible();
  await expect(lists.first().getByRole('button')).toHaveCount(3);
  expect(posts).toHaveLength(0);
  await capture(page, testInfo, 'sunny-fireplace-390');

  await send('dog friendly');
  await expect(log.getByText('Bring the pup! Filtering to dog-friendly venues.')).toBeVisible();
  await expect(log.getByText(/^Brucey's sniffed these out/)).toBeVisible();
  await expect(lists).toHaveCount(2);
  expect(posts).toHaveLength(0);

  await send('hey Sunny, any rooftop bars?');
  await expect(log.getByText('Rooftops incoming! These are scoring best right now.')).toBeVisible();
  await expect(lists).toHaveCount(3);
  expect(posts).toHaveLength(0);

  await send('rooftop bars in Fitzroy');
  await expect(log.getByText(remoteReply, { exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].messages.at(-1)).toEqual({ role: 'user', content: 'rooftop bars in Fitzroy' });

  const chips = quickReplies(dialog);
  const names = await chips.allTextContents();
  await chips.first().tap();
  await expect(log.getByText('Good call. These have the views for sunset.')).toBeVisible();
  await expect(lists).toHaveCount(4);
  await expect(chips).toHaveText(names);
  expect(posts).toHaveLength(1);

  await expect(log.getByText(/Tap (one )?to have a look:/)).toHaveCount(0);
  await expect(log.getByText(/\b\d{1,2}:\d{2}\s*[ap]m\b/i)).toHaveCount(0);
  await expect(log.locator('time')).toHaveCount(0);
  for (const row of await lists.getByRole('button').all()) {
    const name = await row.locator('.ss-sunny-venue-name').innerText();
    const subtitle = await row.locator('.ss-sunny-venue-subtitle').innerText();
    await expect(row).toHaveAccessibleName(`Open ${name}. ${subtitle}`);
    expect(nameContainsLabel(await row.getAttribute('aria-label'), await row.textContent())).toBe(true);
    expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(64);
  }
  await expectSizedControls(dialog);
  const mapAction = log.getByRole('button', { name: 'Show on map', exact: true });
  await expect(mapAction).toHaveCount(1);
  const latest = log.locator('.ss-sunny-message').filter({ has: page.getByRole('list', { name: 'Suggested venues' }) }).last();
  await latest.getByRole('button', { name: 'Show on map', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(launcher(page)).toBeFocused();
});

for (const [width, height] of [[390, 844], [320, 568], [1440, 900]]) {
  test.describe(`Sunny chat at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: width < 1024, hasTouch: width < 1024 });

    test('docks without overflow, traps Tab, and restores focus on each close path', async ({ page, baseURL }) => {
      await boot(page, baseURL);
      const dialog = await openChat(page);
      const input = dialog.getByRole('textbox', { name: 'Message Sunny' });
      const close = dialog.getByRole('button', { name: 'Close chat' });
      await expect(input).toHaveCSS('font-size', '16px');
      await expect(dialog.getByRole('button', { name: 'Send', exact: true })).toHaveCSS('opacity', '0.58');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expectSizedControls(dialog);
      expect(await dialog.evaluate(el => el.parentElement === document.body)).toBe(true);
      const box = await dialog.boundingBox();
      expect(box.x).toBe(0);
      expect(box.width).toBe(width < 1024 ? width : 390);
      expect(box.height).toBe(Math.min(660, height - 24));
      expect(box.y + box.height).toBe(height);
      expect(await dialog.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
      await expect(dialog.locator('.rotate-45')).toHaveCount(0);

      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(input).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(launcher(page)).toBeFocused();

      await openChat(page);
      await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(launcher(page)).toBeFocused();

      await openChat(page);
      await page.locator('.ss-sunny-backdrop').click({ position: { x: 10, y: 10 } });
      await expect(dialog).toHaveCount(0);
      await expect(launcher(page)).toBeFocused();
    });
  });
}

test('Sunny chips match the computed styles of the list sheet chips', async ({ page, baseURL }) => {
  await boot(page, baseURL);
  const styles = chip => chip.evaluate(el => {
    const css = getComputedStyle(el);
    return { border: css.border, background: css.backgroundColor, shadow: css.boxShadow,
      height: css.height, font: css.font, color: css.color };
  });
  await page.getByRole('button', { name: /Show venue list$/ }).tap();
  const listChip = page.locator('.ss-mobile-sheet .ss-quick-chips .ss-quick-chip').first();
  await expect(listChip).toBeVisible();
  const listStyles = await styles(listChip);
  await page.reload();
  const dialog = await openChat(page);
  expect(await styles(quickReplies(dialog).first())).toEqual(listStyles);
});
