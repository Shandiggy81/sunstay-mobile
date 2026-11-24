import { test, expect } from '@playwright/test';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';
import { weather } from './fixtures/weather.js';

const DAY = '2026-10-19';
const NOW = new Date(`${DAY}T04:00:00Z`); // 3pm Melbourne (AEDT)
const titles = ['The Clockmaker', 'An Evening on Stage', 'Laneway Jazz'];
const show = (id, name, hour, music, venue, latitude, longitude, min) => ({
  id, name, url: `https://www.ticketmaster.com.au/event/${id}`,
  dates: { start: { localDate: DAY, localTime: `${hour}:00:00` },
    timezone: 'Australia/Melbourne', status: { code: 'onsale' } },
  classifications: [{ primary: true, segment: { name: music ? 'Music' : 'Arts & Theatre' },
    genre: { name: music ? 'Jazz' : 'Theatre' } }],
  priceRanges: [{ type: 'standard', currency: 'AUD', min, max: min }],
  _embedded: { venues: [{ name: venue, location: { latitude, longitude } }] },
});
const events = [
  show('fixture-theatre-1', titles[0], 19, false, 'Athenaeum Theatre One', '-37.8152', '144.9677', 45),
  show('fixture-theatre-2', titles[1], 19, false, 'Melbourne Town Hall', '-37.8149', '144.9663', 55),
  show('fixture-music-1', `${titles[2]} (18+ Event)`, 21, true, 'Sample Jazz Room', '-37.8161', '144.9680', 35),
];
const forecast = structuredClone(weather);
forecast.current.time = `${DAY}T15:00`;
forecast.hourly.temperature_2m[19] = 15;
forecast.hourly.temperature_2m[21] = 13;
forecast.hourly.precipitation_probability[21] = 60;

async function openPanel(page, baseURL, respond = route => route.fulfill({ json: { _embedded: { events } } })) {
  await page.clock.setFixedTime(NOW);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: forecast });
    if (url.origin === FAKE_SUPABASE_URL && url.pathname === '/functions/v1/events-tonight') return respond(route);
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  const mode = page.getByRole('group', { name: 'Home sheet mode', exact: true });
  await mode.getByRole('button', { name: 'After Dark', exact: true }).click();
  return page.locator('section.ss-after-dark-panel');
}

async function capture(page, testInfo, name) {
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.ss-mobile-sheet--after-dark');
    return !sheet || Math.abs(sheet.getBoundingClientRect().bottom - window.innerHeight) <= 1;
  });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectNoSidewaysScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
}

for (const [width, height] of [[390, 844], [320, 568], [1440, 900]]) {
  test.describe(`After Dark panel at ${width}x${height}`, () => {
    const phone = width < 1024;
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone });

    test('shares the evening forecast and only shows a different forecast on a later row', async ({ page, baseURL }, testInfo) => {
      const panel = await openPanel(page, baseURL);
      await expect(panel).toHaveAccessibleName("Tonight's events");
      await expect(panel.getByText('City forecast at 7pm: 15°, dry, light wind', { exact: true })).toBeVisible();
      await expect(panel.getByRole('status').filter({ hasText: 'Walk times from Flinders St Station' })).toBeVisible();
      await expect(panel.getByText('Tonight nearby', { exact: true })).toHaveCount(0);
      await expect(panel.getByText(/Monday night/)).toHaveCount(0);
      const rows = panel.getByRole('article');
      await expect(rows).toHaveCount(3);
      if (phone) await expect(page.getByRole('heading', { name: "Tonight's events", level: 2, exact: true })).toBeVisible();
      else await expect(page.getByRole('complementary').filter({ has: panel })).toBeVisible();

      for (const [index, title] of titles.entries()) {
        const row = rows.filter({ has: page.getByRole('heading', { name: title, level: 3, exact: true }) });
        await expect(row.locator('h3')).toHaveText(title);
        await expect(row.locator('time')).toHaveText(index === 2 ? '9pm' : '7pm');
        if (index === 2) await expect(row.getByText('At 9pm: 13°, 60% chance of rain, light wind')).toBeVisible();
        else await expect(row.locator('.ss-after-dark-forecast')).toHaveCount(0);
        const tickets = row.getByRole('link', { name: `Tickets for ${title}, on Ticketmaster`, exact: true });
        await expect(tickets).toHaveText('Tickets');
      }
      for (const control of await panel.getByRole('button').or(panel.getByRole('link')).all()) {
        const target = await control.boundingBox();
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.width).toBeGreaterThanOrEqual(44);
      }
      await expectNoSidewaysScroll(page);
      await capture(page, testInfo, `events-${width}`);

      if (phone) {
        await panel.locator('.ss-after-dark-results').evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
        await capture(page, testInfo, `events-${width}-scrolled`);
        const categories = panel.getByRole('group', { name: 'Event category', exact: true });
        await categories.getByRole('button', { name: 'Theatre', exact: true }).tap();
        await expect(rows).toHaveCount(2);
        await expect(rows.filter({ hasText: titles[2] })).toHaveCount(0);
        await expectNoSidewaysScroll(page);
        await categories.getByRole('button', { name: 'Live music', exact: true }).tap();
        await expect(panel.getByText('City forecast at 9pm: 13°, 60% chance of rain, light wind')).toBeVisible();
        await expect(rows.locator('.ss-after-dark-forecast')).toHaveCount(0);
      }
    });
  });
}

test('shows three loading rows, then the unchanged empty state', async ({ page, baseURL }, testInfo) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  try {
    const panel = await openPanel(page, baseURL, async route => {
      await pending;
      await route.fulfill({ json: { _embedded: { events: [] } } });
    });
    await expect(panel.getByText("Loading tonight's events", { exact: true })).toBeAttached();
    await expect(panel.locator('.ss-after-dark-skeleton')).toHaveCount(3);
    await capture(page, testInfo, 'loading-390');
    release();
    await expect(panel.getByText('No shows listed near here tonight.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Cosy spots', exact: true })).toBeVisible();
    await expect(panel.getByText(/City forecast at/)).toHaveCount(0);
    await capture(page, testInfo, 'empty-390');
  } finally {
    release();
  }
});
