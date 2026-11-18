import { test, expect } from '@playwright/test';
import { weather as sunny } from './fixtures/weather.js';

// Monday 19 October 2026, Melbourne daylight time (UTC+11).
const melbourne = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 19, hour - 11, minute));
const SPECIAL = 'Mulled wine $12 from 5pm';

// Overcast, then rain from 6pm on the 19th.
const rainy = structuredClone(sunny);
Object.assign(rainy.current, { temperature_2m: 15, apparent_temperature: 13, cloud_cover: 90, weather_code: 3 });
rainy.hourly.time.forEach((time, i) => {
  const wet = time.startsWith('2026-10-19') && Number(time.slice(11, 13)) >= 18;
  rainy.hourly.temperature_2m[i] = 14;
  rainy.hourly.weather_code[i] = wet ? 63 : 3;
  rainy.hourly.cloud_cover[i] = wet ? 100 : 90;
  rainy.hourly.precipitation_probability[i] = wet ? 80 : 10;
  rainy.hourly.precipitation[i] = wet ? 1.4 : 0;
});

async function openPartnerPreview(page, baseURL, { venue, name, now, forecast }) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(now);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (forecast && url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: forecast });
    // Venues stay on the demo list; nothing else leaves the browser (no forecast when `forecast` is null).
    return route.abort('blockedbyclient');
  });
  await page.goto(`/?venue=${venue}`);
  const card = page.getByRole('article', { name, exact: true });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: new RegExp(`^Run ${name}\\?`) }).click();
  const panel = page.getByRole('dialog', { name });
  await expect(panel.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  return { errors, card, panel };
}

async function expectTouchTargets(locator) {
  for (const box of await locator.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

test('sunny lunch: next service, a special, and the real guest card one tap away at 390×844', async ({ page, baseURL }) => {
  const { errors, card, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: sunny });
  const service = panel.getByRole('article', { name: 'Open now · until 5pm' });
  await expect(service).toContainText('8am–5pm');
  await expect(service).toContainText('Sunny, 23°');
  await expect(service).toContainText('Hours from your listing');
  await expectTouchTargets(panel.locator('.ss-partner-todo button, .ss-partner-viewbar button'));

  // Edit a special: it saves on this device as it's typed, no Save button.
  await panel.getByRole('button', { name: /^Add a special/ }).click();
  await expect(panel.getByLabel('What’s on special?')).toBeFocused();
  await panel.getByLabel('What’s on special?').fill(SPECIAL);
  await expect(panel.getByText('Saved on this device · Preview only')).toBeVisible();

  // One tap to the guest card itself, scrolled to the special.
  const viewSwitch = panel.getByRole('group', { name: 'Partner preview view' });
  await viewSwitch.getByRole('button', { name: 'Guest view' }).tap();
  const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
  await expect(guest).toBeVisible();
  const specials = guest.locator('section[aria-labelledby="happy-hour-heading"]');
  await expect(specials).toContainText(SPECIAL);
  await expect(specials).toContainText('From the partner preview on this device');
  await expect(specials).toBeInViewport();
  await expect(panel.getByLabel('What’s on special?')).toBeHidden();

  // Back to editing: the draft and the place in the editor are kept.
  await viewSwitch.getByRole('button', { name: 'Edit' }).tap();
  await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);
  await expect(panel.getByRole('button', { name: /^Special added/ })).toContainText(`“${SPECIAL}”`);

  // The heating answer reaches the same guest card.
  await panel.getByRole('radio', { name: /No, our heating is indoors only/ }).check();
  await viewSwitch.getByRole('button', { name: 'Guest view' }).tap();
  // The card names a warm indoor space twice (a chip up top and Good to know).
  await expect(guest.getByText('Outdoor heaters', { exact: true })).toHaveCount(0);
  await expect(guest.locator('.ss-venue-fact').filter({ hasText: /^Warm indoor space$/ })).toHaveCount(1);
  await expect(panel.getByText('Off your card in this preview:')).toBeVisible();

  // Closing keeps it all on this device; guests' card underneath still shows the listing.
  await panel.getByRole('button', { name: 'Close partner preview' }).click();
  await expect(card.locator('.ss-venue-fact').filter({ hasText: /^Outdoor heaters$/ })).toHaveCount(1);
  await card.getByRole('button', { name: /^Run Mr Tulk\?/ }).click();
  await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);
  await expect(panel.getByRole('radio', { name: /No, our heating is indoors only/ })).toBeChecked();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('rainy evening: the next service warns about rain before opening', async ({ page, baseURL }) => {
  const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-25', name: 'La La Land Windsor', now: melbourne(16, 10), forecast: rainy });
  const service = panel.getByRole('article', { name: 'Opens 5pm tonight' });
  await expect(service).toContainText('5pm–1am');
  await expect(service).toContainText('Rain likely from 6pm');
  await expect(service).toContainText('80% chance · 14°');
  await expect(service).toContainText('Plan for wet arrivals');
  expect(errors).toEqual([]);
});

test('missing data: no forecast and unreadable hours are asked for, not guessed', async ({ page, baseURL }) => {
  const tulk = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: null });
  await expect(tulk.panel.getByRole('article', { name: 'Open now · until 5pm' })).toContainText('Forecast unavailable right now');
  await expect(tulk.panel.getByText('We won’t guess the weather for this service.')).toBeVisible();
  await tulk.panel.getByRole('button', { name: 'Close partner preview' }).click();

  await page.goto('/?venue=dv-22');
  const card = page.getByRole('article', { name: 'Arbory Afloat', exact: true });
  await card.getByRole('button', { name: /^Run Arbory Afloat\?/ }).click();
  const panel = page.getByRole('dialog', { name: 'Arbory Afloat' });
  await expect(panel.getByRole('article', { name: 'Hours not set' })).toContainText('Add your service hours');
  await panel.getByRole('button', { name: /^Add your service hours/ }).click();
  await expect(panel.getByRole('button', { name: 'Hide service hours' })).toBeVisible();
  expect(tulk.errors).toEqual([]);
});

test.describe('wide window', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('the guest card sits beside the editor and shows the special as it saves', async ({ page, baseURL }) => {
    const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: sunny });
    const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
    await expect(guest).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Partner preview view' })).toBeHidden();
    await panel.getByLabel('What’s on special?').fill(SPECIAL);
    await expect(guest.locator('section[aria-labelledby="happy-hour-heading"]')).toContainText(SPECIAL);
    await expect(guest.locator('section[aria-labelledby="happy-hour-heading"]')).toBeInViewport();
    expect(errors).toEqual([]);
  });
});
