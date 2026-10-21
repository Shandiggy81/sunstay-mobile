import { test, expect } from '@playwright/test';
import { weather } from './fixtures/weather.js';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';

// Melbourne daylight time on the fixture's day (UTC+11).
const melbourne = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 18, hour + 13, minute));
// Buildings everywhere except the north (330°–30°): a short midday window.
const HORIZON = Array.from({ length: 36 }, (_, i) => (i >= 33 || i < 3 ? 0 : 75));
const VENUE = 'Wonderland Bar';

/** "1h 28m" / "45m" / "2h" → minutes. */
function minutes(text) {
  const m = /(?:(\d+)h)?\s*(?:(\d+)m)?/.exec(text.trim());
  return Number(m?.[1] ?? 0) * 60 + Number(m?.[2] ?? 0);
}

async function boot(page, baseURL, now, { horizon = null } = {}) {
  const errors = [];
  const seen = { supabase: 0, horizon: 0, realSupabase: 0 };
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(now);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
    if (url.hostname.endsWith('.supabase.co')) seen.realSupabase += 1;
    if (url.origin === FAKE_SUPABASE_URL) {
      seen.supabase += 1;
      if (horizon && url.pathname.endsWith('/microclimate_profiles')) {
        seen.horizon += 1;
        const row = { sun_horizon_deg: horizon };
        const single = /vnd\.pgrst\.object/.test(route.request().headers().accept ?? '');
        return route.fulfill({ json: single ? row : [row] });
      }
    }
    // Venues stay on the demo list; nothing else leaves the browser.
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.getByText('23°', { exact: true })).toBeVisible();
  return { errors, seen };
}

async function openVenue(page) {
  await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search venues', exact: true }).fill(VENUE);
  await page.locator('.ss-mobile-sheet').getByRole('button', { name: /^Venue: / }).filter({ hasText: VENUE }).first().tap();
  await expect(page.getByRole('heading', { level: 2, name: VENUE, exact: true })).toBeVisible();
  return page.getByRole('article', { name: VENUE });
}

async function expectFitsPhone(page) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
}

for (const [label, now, sunNow] of [
  ['midday', melbourne(11), /^Sun until|^Sun returns|^Shaded now|^No more sun/],
  ['before sunrise', melbourne(5), /^Sun up /],
  ['after sunset', melbourne(21), /^Sun has set$/],
]) {
  test(`outdoor venue card sun text is consistent at 390×844 (${label})`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await boot(page, baseURL, now);
    const card = await openVenue(page);
    const tile = card.getByLabel('Current venue conditions').locator('div').filter({ hasText: 'Sun now' }).locator('dd');
    await expect(tile).toHaveText(sunNow);
    const text = await card.innerText();
    const left = [...text.matchAll(/(\d+h(?: \d+m)?|\d+m) of direct sun left today/g)].map(m => minutes(m[1]));
    const totals = [...text.matchAll(/(?:of today's|had about|Expect about) (\d+h(?: \d+m)?|\d+m)/g)].map(m => minutes(m[1]));
    for (const l of left) for (const t of totals) expect(l).toBeLessThanOrEqual(t);
    await expectFitsPhone(page);
    const shot = testInfo.outputPath(`venue-sun-${label.replace(/ /g, '-')}-390.png`);
    await page.screenshot({ path: shot });
    await testInfo.attach(`${VENUE} at 390×844 (${label})`, { path: shot, contentType: 'image/png' });
    expect(errors, 'Unhandled browser errors').toEqual([]);
  });
}

test('Sun moments card: remaining never exceeds the venue total at 390×844', async ({ page, baseURL }, testInfo) => {
  const { errors, seen } = await boot(page, baseURL, melbourne(11), { horizon: HORIZON });
  await expect.poll(() => seen.supabase, { message: 'smoke build uses the fake Supabase client' }).toBeGreaterThan(0);
  const card = await openVenue(page);
  const moments = card.locator('section', { has: page.getByRole('heading', { name: 'Sun moments today' }) });
  await expect(moments).toBeVisible();
  expect(seen.horizon).toBeGreaterThan(0);

  const hero = await moments.getByText(/of sun at this venue today$/).locator('xpath=preceding-sibling::p[1]').innerText();
  const total = minutes(hero);
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThan(6 * 60);

  const text = await card.innerText();
  // The open-sky forecast's "left today" must not sit beside the venue total.
  expect(text).not.toMatch(/of direct sun left today/);
  const pair = /(\d+h(?: \d+m)?|\d+m) of today's (\d+h(?: \d+m)?|\d+m)/.exec(text);
  expect(pair, 'sentence pairs remaining with the total').not.toBeNull();
  expect(minutes(pair[2])).toBe(total);
  expect(minutes(pair[1])).toBeLessThanOrEqual(total);
  const tile = card.getByLabel('Current venue conditions').locator('div').filter({ hasText: 'Sun now' }).locator('dd');
  await expect(tile).toHaveText(/^Sun from \d|^Sun until \d/);

  // Scroll only the card's own scroller (scrollIntoView would also move the
  // overflow-hidden overlay) so the stat row, sentence and total share a frame.
  await card.locator('[data-venue-card-scroller]').evaluate(scroller => {
    const stats = scroller.querySelector('[aria-label="Current venue conditions"]');
    scroller.style.scrollBehavior = 'auto';
    scroller.scrollTop += stats.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  });
  await expectFitsPhone(page);
  const shot = testInfo.outputPath('venue-sun-moments-390.png');
  await page.screenshot({ path: shot });
  await testInfo.attach(`${VENUE} sun moments at 390×844`, { path: shot, contentType: 'image/png' });
  expect(seen.realSupabase, 'no request to a real Supabase project').toBe(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

for (const timezoneId of ['Europe/London', 'America/Los_Angeles']) {
  test.describe(`venue-local time from ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('valid Melbourne sun times and forecast hours with and without a horizon', async ({ page, baseURL }, testInfo) => {
      const { errors, seen } = await boot(page, baseURL, melbourne(11));
      let card = await openVenue(page);
      const sunTile = () => card.getByLabel('Current venue conditions').locator('div').filter({ hasText: 'Sun now' }).locator('dd');
      await expect(sunTile()).toHaveText(/^Sun until 7:\d{2}pm$/);
      await expect(card.getByText('Melbourne time', { exact: true })).toBeVisible();
      const hours = card.locator('section', { has: page.getByRole('heading', { name: 'Hour by hour', exact: true }) }).getByRole('listitem');
      await expect(hours.first()).toHaveAttribute('aria-label', /^Now: 23 degrees/);
      await expect(hours.nth(1)).toHaveAttribute('aria-label', /^12pm: 23 degrees/);
      await expect(card.getByText(/Sun times unavailable|Sun times aren't available/)).toHaveCount(0);

      // Fresh navigation with a building horizon exercises Sun Moments and the
      // new outdoor summary, rather than only the no-geometry fallback.
      await page.unroute('**/*');
      const second = await boot(page, baseURL, melbourne(11), { horizon: HORIZON });
      card = await openVenue(page);
      await expect(card.getByRole('heading', { name: 'Sun moments today', exact: true })).toBeVisible();
      await expect(sunTile()).toHaveText(/^Sun from 1[12]:\d{2}(am|pm)$|^Sun until \d/);
      const screenshot = testInfo.outputPath('melbourne-sun-from-overseas-390.png');
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`Melbourne venue from ${timezoneId}`, { path: screenshot, contentType: 'image/png' });
      expect(seen.realSupabase + second.seen.realSupabase).toBe(0);
      expect([...errors, ...second.errors]).toEqual([]);
      await expectFitsPhone(page);
    });
  });
}
