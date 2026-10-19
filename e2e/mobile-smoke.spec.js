import { test as base, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    let weatherRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    // Fixed Date, with real timers: animation and network timeouts must still run.
    await page.clock.setFixedTime(NOW);
    await page.context().routeWebSocket('**', socket => socket.close());
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') {
        weatherRequests += 1;
        return route.fulfill({ json: weather });
      }
      // Fonts, maps, telemetry, AQ, Supabase and AI requests never leave the browser.
      return route.abort('blockedbyclient');
    });
    await page.goto('/');
    // A unique mock temperature proves weather parsing succeeded instead of demo fallback.
    await expect(page.getByText('23°', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
    await use(page);
    expect(weatherRequests).toBeGreaterThan(0);
    expect(errors, 'Unhandled browser errors').toEqual([]);
  },
});

const list = page => page.locator('.ss-mobile-sheet');
const sheet = page => page.locator('.ss-filter-sheet');
const count = page => list(page).locator('.ss-mobile-sheet-head p').filter({ hasText: /^\d+ results$/ });
const rows = page => list(page).getByRole('button', { name: /^Venue: / });

async function openList(page) {
  await page.getByText(/^\d+ venues nearby$/).click();
  await expect(list(page).getByRole('heading', { name: 'Venues', exact: true })).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
}

async function openFilters(page) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Filters', exact: true })).toBeVisible();
}

test('app loads and the venue list opens', async ({ page }) => {
  await openList(page);
  await expect(count(page)).toHaveText(/^[1-9]\d* results$/);
  await expect(page.getByRole('textbox', { name: 'Search venues', exact: true })).toBeVisible();
});

test('Filters sits above the expanded list and its buttons receive taps', async ({ page }, testInfo) => {
  await openList(page);
  const before = await count(page).innerText();
  await openFilters(page);
  const cafe = sheet(page).getByRole('button', { name: 'Cafe', exact: true });
  // Real taps without force or DOM clicks catch overlays swallowing interaction.
  await cafe.tap();
  await expect(cafe).toHaveAttribute('aria-pressed', 'true');
  await sheet(page).getByRole('button', { name: 'Clear all', exact: true }).tap();
  await expect(cafe).toHaveAttribute('aria-pressed', 'false');
  const screenshot = testInfo.outputPath('mobile-filters-390.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('Filters at 390×844', { path: screenshot, contentType: 'image/png' });
  await sheet(page).getByRole('button', { name: /^Show \d+ venues?$/ }).tap();
  await expect(sheet(page)).toBeHidden();
  await expect(count(page)).toHaveText(before);
});

test('Cafe narrows the venue count and Clear all restores it', async ({ page }) => {
  await openList(page);
  const before = await count(page).innerText();
  const total = Number.parseInt(before, 10);
  await openFilters(page);
  await sheet(page).getByRole('button', { name: 'Cafe', exact: true }).tap();
  const show = sheet(page).getByRole('button', { name: /^Show \d+ venues?$/ });
  await expect(show).not.toHaveText(`Show ${total} venues`);
  const cafeTotal = Number.parseInt((await show.innerText()).replace('Show ', ''), 10);
  expect(cafeTotal).toBeGreaterThan(0);
  expect(cafeTotal).toBeLessThan(total);
  await show.tap();
  await expect(sheet(page)).toBeHidden();
  await expect(count(page)).toHaveText(`${cafeTotal} results`);
  await expect(list(page).locator('.ss-mobile-sheet-search').getByRole('button', { name: /Cafe/ })).toBeVisible();
  await expect(rows(page).first().locator('.ss-vlc-sub')).toContainText(/cafe/i);
  await openFilters(page);
  await sheet(page).getByRole('button', { name: 'Clear all', exact: true }).tap();
  await expect(sheet(page).getByRole('button', { name: 'Cafe', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(show).toHaveText(`Show ${total} venues`);
  await show.tap();
  await expect(sheet(page)).toBeHidden();
  await expect(count(page)).toHaveText(before);
});

test('a list row opens VenueCard and closing it returns to venue browsing', async ({ page }) => {
  await openList(page);
  const before = await count(page).innerText();
  const row = rows(page).first();
  const name = await row.locator('.ss-vlc-name').innerText();
  await row.tap();
  await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  const close = page.getByRole('button', { name: 'Close venue details', exact: true });
  await expect(close).toBeVisible();
  await close.tap();
  await expect(close).toBeHidden();
  // The existing card returns to the collapsed list handle; reopen it normally.
  await openList(page);
  await expect(count(page)).toHaveText(before);
  await expect(rows(page).filter({ hasText: name }).first()).toBeVisible();
});
