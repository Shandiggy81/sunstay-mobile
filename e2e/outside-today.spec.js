import { test, expect } from '@playwright/test';
import { weather } from './fixtures/weather.js';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';

// The venue card's sun-and-wind block (src/components/OutsideToday.jsx):
// one verdict, one strip for the day, and a slider that moves the app's time.

// Melbourne daylight time on the fixture's day (UTC+11).
const melbourne = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 18, hour + 13, minute));
// Buildings everywhere except the north (330°–30°): a short midday window.
const HORIZON = Array.from({ length: 36 }, (_, i) => (i >= 33 || i < 3 ? 0 : 75));
const VENUE = 'Wonderland Bar';

function forecastWith(change) {
  const copy = structuredClone(weather);
  change(copy);
  return copy;
}
// Rain all day, in every forecast hour and the current reading.
const rainy = forecastWith((w) => {
  Object.assign(w.current, { precipitation: 1.6, weather_code: 63, cloud_cover: 100 });
  for (const [key, value] of Object.entries({ precipitation_probability: 90, precipitation: 1.6, weather_code: 63, cloud_cover: 100 })) {
    w.hourly[key] = w.hourly.time.map(() => value);
  }
});
// A gale all day: 80 km/h in the open is very windy even in a beer garden.
const gale = forecastWith((w) => {
  Object.assign(w.current, { wind_speed_10m: 80, wind_gusts_10m: 110 });
  w.hourly.wind_speed_10m = w.hourly.time.map(() => 80);
  w.hourly.wind_gusts_10m = w.hourly.time.map(() => 110);
});

async function boot(page, baseURL, now, { horizon = null, forecast = weather } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(now);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: forecast });
    if (horizon && url.origin === FAKE_SUPABASE_URL && url.pathname.endsWith('/microclimate_profiles')) {
      const row = { sun_horizon_deg: horizon };
      const single = /vnd\.pgrst\.object/.test(route.request().headers().accept ?? '');
      return route.fulfill({ json: single ? row : [row] });
    }
    // Venues stay on the demo list; nothing else leaves the browser.
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.getByText('23°', { exact: true })).toBeVisible();
  return { errors };
}

async function openVenue(page, { defaultMode = 'Sun' } = {}) {
  const modes = page.getByRole('group', { name: 'Home sheet mode', exact: true });
  await expect(modes.getByRole('button', { name: defaultMode, exact: true })).toHaveAttribute('aria-pressed', 'true');
  if (defaultMode !== 'Sun') await modes.getByRole('button', { name: 'Sun', exact: true }).click();
  await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search venues', exact: true }).fill(VENUE);
  await page.getByRole('combobox', { name: 'Search venues', exact: true }).press('Enter');
  await page.locator('.ss-mobile-sheet').getByRole('button', { name: /^Venue: / }).filter({ hasText: VENUE }).first().tap();
  await expect(page.getByRole('heading', { level: 2, name: VENUE, exact: true })).toBeVisible();
  return page.getByRole('article', { name: VENUE });
}

/** Nothing in the block is smaller than the design allows: 12px text, 44px targets, no sideways scroll. */
async function expectPhoneReady(page, card) {
  const report = await card.locator('[data-outside-today]').evaluate((block) => {
    const hasOwnText = el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
    return {
      smallText: [...block.querySelectorAll('*')].filter(el => hasOwnText(el) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim().slice(0, 30)),
      smallTargets: [...block.querySelectorAll('button, input')].map((el) => { const r = el.getBoundingClientRect(); return { name: el.textContent.trim().slice(0, 20) || el.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter(target => target.w < 44 || target.h < 44),
    };
  });
  expect(report.smallText, 'text under 12px').toEqual([]);
  expect(report.smallTargets, 'touch targets under 44px').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
}

test('one verdict for sun and wind, and the slider moves the whole card at 390×844', async ({ page, baseURL }, testInfo) => {
  const { errors } = await boot(page, baseURL, melbourne(11));
  const card = await openVenue(page);
  const verdict = card.locator('[data-outside-verdict]');
  const slider = card.getByRole('slider', { name: 'Time of day', exact: true });

  // Now: the headline, the to-the-minute sun line and the wind row agree.
  await expect(verdict).toHaveText(/^Right now\s*Sunny/);
  await expect(card.getByLabel('Current venue conditions').locator('dd')).toHaveText(/^Sun until 7:\d{2}pm$/);
  const windWord = (await card.getByLabel('Weather now').locator('dd').first().innerText()).trim();
  expect(windWord).toMatch(/^(Calm|Light wind|Breezy|Windy|Very windy)$/);
  // The wind word that pairs with the sun score is the wind row's word.
  await expect(card.locator('[data-score-wind]')).toHaveText(new RegExp(`${windWord}$`));
  await expect(card.locator('.ss-venue-sun-sentence')).toHaveText(/Feels \d+° /);
  await expect(slider).toHaveAttribute('aria-valuetext', /^Now: Sunny/);
  await expect(slider).toHaveValue('11');
  await expect(card.getByRole('button', { name: 'Back to now', exact: true })).toBeDisabled();
  // The old single bar is replaced by the strip, not shown beside it.
  await expect(card.getByRole('heading', { name: 'Today’s sun' })).toHaveCount(0);
  await expect(card.getByRole('heading', { name: 'Today outside', exact: true })).toBeVisible();
  await expectPhoneReady(page, card);

  // Another hour: the headline, the weather row and the score follow the slider.
  await slider.fill('16');
  await expect(verdict).toHaveText(/^At 4pm\s*Sunny/);
  await expect(slider).toHaveAttribute('aria-valuetext', /^4pm: Sunny/);
  await expect(card.getByLabel('Weather at 4pm')).toBeVisible();
  await expect(card.getByLabel('Weather at 4pm').getByText('Rain at 4pm', { exact: true })).toBeVisible();
  // The sun line describes this moment, so it is not shown for another hour.
  await expect(card.getByLabel('Current venue conditions')).toHaveCount(0);
  await expect(card.locator('.ss-venue-sun-sentence')).toHaveText(/^Full sun until \d+pm\. Feels \d+° /);
  const shot = testInfo.outputPath('outside-today-4pm-390.png');
  await page.screenshot({ path: shot });
  await testInfo.attach(`${VENUE} at 4pm, 390×844`, { path: shot, contentType: 'image/png' });

  // A time chip picks its hour; "Back to now" returns.
  const times = card.getByRole('list', { name: 'Good times to sit outside', exact: true });
  await times.getByRole('button', { name: /^1pm/ }).click();
  await expect(verdict).toHaveText(/^At 1pm/);
  await expect(times.getByRole('button', { name: /^1pm/ })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Back to now', exact: true }).click();
  await expect(verdict).toHaveText(/^Right now/);
  await expect(card.getByLabel('Current venue conditions')).toBeVisible();
  await expect(slider).toHaveValue('11');
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('the verdict says rain when the sun line does', async ({ page, baseURL }) => {
  const { errors } = await boot(page, baseURL, melbourne(11), { forecast: rainy });
  const card = await openVenue(page);
  await expect(card.getByLabel('Current venue conditions').locator('dd')).toHaveText('Raining');
  await expect(card.locator('[data-outside-verdict]')).toHaveAttribute('data-outside-verdict', 'rain');
  await expect(card.locator('[data-outside-verdict]')).toHaveText(/^Right now\s*(Rain|Wet)/);
  // No hour of this day is a good time to sit outside.
  await expect(card.locator('[data-outside-times] button.is-good')).toHaveCount(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

// Its own test: the app caches weather for the session, so one page cannot see two forecasts.
test('a gale reads as sunny but windy, with no good time to sit outside', async ({ page, baseURL }) => {
  const { errors } = await boot(page, baseURL, melbourne(11), { forecast: gale });
  const card = await openVenue(page);
  await expect(card.locator('[data-outside-verdict]')).toHaveText(/^Right now\s*Sunny but windy$/);
  await expect(card.locator('[data-score-wind]')).toHaveText(/(Windy|Very windy)$/);
  await expect(card.getByLabel('Weather now').locator('dd').first()).toHaveText(/^(Windy|Very windy)$/);
  await expect(card.locator('[data-outside-times] button.is-good')).toHaveCount(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});

test('after dark the verdict says so and offers no times; building shade shows in the strip', async ({ page, baseURL }, testInfo) => {
  let { errors } = await boot(page, baseURL, melbourne(21));
  let card = await openVenue(page, { defaultMode: 'After Dark' });
  await expect(card.getByLabel('Current venue conditions').locator('dd')).toHaveText('Sun has set');
  await expect(card.locator('[data-outside-verdict]')).toHaveText(/^Right now\s*After dark/);
  await expect(card.locator('[data-outside-times]')).toHaveCount(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);

  // With a stored horizon the strip shows the buildings' shade, beside Sun moments.
  await page.unroute('**/*');
  ({ errors } = await boot(page, baseURL, melbourne(11), { horizon: HORIZON }));
  card = await openVenue(page);
  await expect(card.getByRole('heading', { name: 'Sun moments today', exact: true })).toBeVisible();
  const strip = card.locator('[data-outside-today]');
  await expect(strip.locator('.ss-outside__cells > [data-sun="shade"]').first()).toBeAttached();
  await expect(strip.locator('.ss-outside__cells > [data-sun="sun"]').first()).toBeAttached();
  expect(await strip.locator('.ss-outside__cells > [data-sun="sun"]').count()).toBeLessThan(6);
  // The verdict for now uses the same reading as the sun line.
  const line = (await card.getByLabel('Current venue conditions').locator('dd').innerText()).trim();
  await expect(card.locator('[data-outside-verdict]')).toHaveAttribute('data-outside-verdict', /^Sun until/.test(line) ? 'sun' : 'shade');
  await expectPhoneReady(page, card);
  const shot = testInfo.outputPath('outside-today-shade-390.png');
  await page.screenshot({ path: shot });
  await testInfo.attach(`${VENUE} with building shade, 390×844`, { path: shot, contentType: 'image/png' });
  expect(errors, 'Unhandled browser errors').toEqual([]);
});
