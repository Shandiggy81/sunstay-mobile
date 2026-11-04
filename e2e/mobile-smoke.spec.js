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
    await expect(page.getByText('23°', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
    await use(page);
    expect(weatherRequests).toBeGreaterThan(0);
    expect(errors, 'Unhandled browser errors').toEqual([]);
  },
});

const list = page => page.locator('.ss-mobile-sheet');
const sheet = page => page.locator('.ss-filter-sheet');
const count = page => list(page).locator('.ss-mobile-sheet-head .ss-home-count');
const rows = page => list(page).getByRole('button', { name: /^Venue: / });

async function openList(page) {
  await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
  await expect(list(page).locator('#mobile-discovery-results')).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
}

async function openFilters(page) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Filters', exact: true })).toBeVisible();
  // Wait for the slide-up to finish (~400 ms): a tap aimed mid-slide can land on
  // the 44 px pill below the one meant (Beer garden under Cafe).
  await expect(sheet(page)).toHaveCSS('transform', 'none');
}

test('app loads and the venue list opens', async ({ page }) => {
  await openList(page);
  await expect(count(page)).toHaveText(/^[1-9]\d* venues?$/);
  await expect(page.getByRole('combobox', { name: 'Search venues', exact: true })).toBeVisible();
  const firstRow = rows(page).first();
  await expect(firstRow).toHaveCSS('box-shadow', 'none');
  await expect(firstRow).toHaveCSS('border-radius', '0px');
  const rowTexts = await rows(page).allTextContents();
  expect(rowTexts.every(text => !text.includes('Now:') && !text.includes('°'))).toBe(true);
});

test('Filters sits above the expanded list and its buttons receive taps', async ({ page }, testInfo) => {
  await openList(page);
  const before = await count(page).innerText();
  await openFilters(page);
  const cafe = sheet(page).getByRole('group', { name: 'Quick picks', exact: true }).getByRole('button', { name: 'Cafe', exact: true });
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
  const quickCafe = sheet(page).getByRole('group', { name: 'Quick picks', exact: true }).getByRole('button', { name: 'Cafe', exact: true });
  await quickCafe.tap();
  await expect(quickCafe).toHaveAttribute('aria-pressed', 'true');
  const show = sheet(page).getByRole('button', { name: /^Show \d+ venues?$/ });
  await expect(show).not.toHaveText(`Show ${total} venues`);
  const cafeTotal = Number.parseInt((await show.innerText()).replace('Show ', ''), 10);
  expect(cafeTotal).toBeGreaterThan(0);
  expect(cafeTotal).toBeLessThan(total);
  await show.tap();
  await expect(sheet(page)).toBeHidden();
  await expect(count(page)).toHaveText(`${cafeTotal} ${cafeTotal === 1 ? 'venue' : 'venues'}`);
  await expect(list(page).locator('.ss-home-list-chips').getByRole('button', { name: /Cafe/ })).toBeVisible();
  await expect(rows(page).first().locator('.ss-vlc-sub')).toContainText(/cafe/i);
  await openFilters(page);
  await sheet(page).getByRole('button', { name: 'Clear all', exact: true }).tap();
  await expect(sheet(page).getByRole('group', { name: 'Quick picks', exact: true }).getByRole('button', { name: 'Cafe', exact: true })).toHaveAttribute('aria-pressed', 'false');
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


test('venue card uses an ink directions button and opaque surfaces', async ({ page }) => {
  await openList(page);
  const row = rows(page).first();
  const name = await row.locator('.ss-vlc-name').innerText();
  await row.tap();
  const card = page.getByRole('article', { name, exact: true });
  await expect(card.getByRole('link', { name: 'Get directions', exact: true })).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  const blurred = await card.locator('*').evaluateAll(elements => elements.filter(element => {
    const style = getComputedStyle(element);
    return style.backdropFilter !== 'none' || (style.webkitBackdropFilter && style.webkitBackdropFilter !== 'none');
  }).map(element => element.className));
  expect(blurred, 'Venue details must use opaque surfaces without backdrop blur').toEqual([]);
});


test('Food & drink rows share selection with Quick picks and summarize it when collapsed', async ({ page }) => {
  await openFilters(page);
  const food = sheet(page).getByRole('button', { name: /^Food & drink/ });
  await food.tap();
  const panel = sheet(page).locator('#ss-filter-group-food-drink');
  await expect(panel.getByRole('heading', { name: 'Type of place', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'On offer', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Cafe', exact: true }).tap();
  const quickCafe = sheet(page).getByRole('group', { name: 'Quick picks', exact: true }).getByRole('button', { name: 'Cafe', exact: true });
  await expect(quickCafe).toHaveAttribute('aria-pressed', 'true');
  await food.tap();
  await expect(food).toHaveAttribute('aria-expanded', 'false');
  await expect(food).toContainText('1 selected');
  await sheet(page).getByRole('button', { name: 'Close filters', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  await openFilters(page);
  await expect(food).toHaveAttribute('aria-expanded', 'false');
});

test('a stay leads with its property website and names the external destination', async ({ page }) => {
  await page.goto('/?venue=dv-melb-stay-08');
  const card = page.getByRole('article', { name: 'Quest St Kilda Bayside', exact: true });
  const website = card.getByRole('link', { name: 'Visit property website', exact: true });
  await expect(website).toHaveAttribute('href', 'https://www.questapartments.com.au/properties/vic/st-kilda/quest-st-kilda-bayside');
  await expect(website).toHaveAttribute('target', '_blank');
  await expect(website).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(website).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  await expect(website).toHaveAccessibleDescription('Opens questapartments.com.au');
  await expect(card.getByText('Opens questapartments.com.au', { exact: true })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Get directions', exact: true })).toHaveCSS('color', 'rgb(146, 64, 14)');
});


test.describe('desktop Filters column', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('docks beside the map and returns focus after Escape', async ({ page }) => {
    await openFilters(page);
    const bounds = await sheet(page).boundingBox();
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(390);
    expect(bounds.y + bounds.height).toBe(900);

    await expect(sheet(page).locator('.ss-filter-group-toggle')).toHaveCount(4);
    const controls = sheet(page).getByRole('button', { name: /^Show \d+ venues?$/ })
      .or(sheet(page).locator('.ss-filter-group-toggle'));
    for (const control of await controls.all()) {
      const box = await control.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    await page.keyboard.press('Escape');
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  });
});
