import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

const tile = page => page.locator('.ss-home-weather-card');
const panel = page => page.locator('.ss-map-first-weather-details');
const search = page => page.getByRole('combobox', { name: 'Search venues', exact: true });

async function expectOpen(page, open) {
  await expect(tile(page)).toHaveAttribute('aria-expanded', String(open));
  if (open) await expect(panel(page)).toBeVisible();
  else await expect(panel(page)).toHaveCount(0);
}

for (const [width, height] of [[320, 568], [390, 844]]) {
  test.describe(`Weather dismissal at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page, baseURL }) => {
      // Native timers keep the header and sheets' real animations running.
      await page.addInitScript(epoch => {
        const RealDate = Date, started = RealDate.now();
        const now = () => epoch + RealDate.now() - started;
        window.Date = new Proxy(RealDate, {
          construct: (target, args) => new target(...(args.length ? args : [now()])),
          apply: () => new RealDate(now()).toString(),
          get: (target, key) => key === 'now' ? now : Reflect.get(target, key),
        });
      }, NOW.getTime());
      await page.context().routeWebSocket('**', socket => socket.close());
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === baseURL) return route.continue();
        if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') {
          return route.fulfill({ json: weather });
        }
        return route.abort('blockedbyclient');
      });
      await page.goto('/');
      await expect(tile(page)).toBeEnabled();
    });

    test('tile toggles, inside taps stay open and Escape restores the tile', async ({ page }) => {
      await tile(page).tap();
      await expectOpen(page, true);
      await panel(page).locator('dt').first().tap();
      await expectOpen(page, true);
      // Escape also works when focus is on the page rather than in the header.
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press('Escape');
      await expectOpen(page, false);
      await expect(tile(page)).toBeFocused();
      await tile(page).tap();
      await expectOpen(page, true);
      await tile(page).tap();
      await expectOpen(page, false);
      await expect(tile(page)).toHaveCSS('height', '58px');
    });

    test('outside taps dismiss and preserve another control’s focus', async ({ page }) => {
      await tile(page).tap();
      // A real tap on the empty fallback-map area, outside the header and sheet.
      await page.touchscreen.tap(20, 230);
      await expectOpen(page, false);
      await expect(tile(page)).toBeFocused();
      await tile(page).click();
      await page.mouse.click(20, 230);
      await expectOpen(page, false);
      await expect(tile(page)).toBeFocused();
      await tile(page).tap();
      const sun = page.getByRole('button', { name: 'Sun', exact: true });
      await sun.tap();
      await expectOpen(page, false);
      await expect(sun).toBeFocused();

      await tile(page).tap();
      await page.keyboard.press('Tab'); // Rain radar is a separate control.
      const radar = page.getByRole('switch', { name: 'Rain radar', exact: true });
      await expect(radar).toBeFocused();
      await page.keyboard.press('Escape');
      await expectOpen(page, false);
      await expect(radar).toBeFocused();
    });

    test('keyboard focus alone keeps it open; search suggestions close it permanently', async ({ page }) => {
      await tile(page).tap();
      await page.keyboard.press('Tab'); // Rain radar
      await page.keyboard.press('Tab'); // Search
      await expect(search(page)).toBeFocused();
      await expectOpen(page, true);
      await search(page).pressSequentially('Quest');
      await expect(page.getByRole('listbox', { name: 'Search suggestions', exact: true })).toBeVisible();
      await expectOpen(page, false);
      await search(page).press('Escape');
      await expect(page.getByRole('listbox', { name: 'Search suggestions', exact: true })).toHaveCount(0);
      await expectOpen(page, false);
    });

    test('hiding for a venue clears the panel and venue Escape remains independent', async ({ page }) => {
      await tile(page).tap();
      const listButton = page.getByRole('button', { name: 'Show venue list', exact: true });
      await listButton.focus();
      await page.keyboard.press('Enter');
      const row = page.locator('.ss-mobile-sheet').getByRole('button', { name: /^Venue: / }).first();
      await row.focus();
      await page.keyboard.press('Enter');
      const venue = page.getByRole('dialog', { name: / details$/ });
      await expect(venue).toHaveCSS('opacity', '1');
      await expectOpen(page, false);
      await page.keyboard.press('Escape');
      await expect(venue).toBeHidden();
      await expect(listButton).toBeFocused();
      await expectOpen(page, false);
    });

    test('Escape belongs to Filters and the existing Preview time popover', async ({ page }) => {
      await tile(page).tap();
      // Keyboard activation avoids an outside pointerup dismissing weather first.
      const filters = page.getByRole('button', { name: 'Filters', exact: true });
      await filters.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
      await expect(dialog).toHaveCSS('transform', 'none');
      await expectOpen(page, true);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(filters).toBeFocused();
      await expectOpen(page, true);
      await page.keyboard.press('Escape');
      await expectOpen(page, false);
      await expect(filters).toBeFocused();

      await tile(page).tap();
      const preview = page.getByRole('button', { name: /Preview time$/ });
      await preview.focus();
      await page.keyboard.press('Enter');
      const time = page.getByRole('dialog', { name: 'Preview time', exact: true });
      await expect(time).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(time).toBeHidden();
      await expect(preview).toBeFocused();
      await expectOpen(page, true);
      await page.keyboard.press('Escape');
      await expectOpen(page, false);
      await expect(preview).toBeFocused();

      // Opening Preview first reverses the native listener registration order.
      await page.keyboard.press('Enter');
      await expect(time).toBeVisible();
      await tile(page).focus();
      await page.keyboard.press('Enter');
      await expectOpen(page, true);
      await page.keyboard.press('Escape');
      await expect(time).toBeHidden();
      await expect(preview).toBeFocused();
      await expectOpen(page, true);
      await page.keyboard.press('Escape');
      await expectOpen(page, false);
      await expect(preview).toBeFocused();

      await tile(page).tap();
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      const offline = page.getByRole('dialog', { name: 'Oops! Brucey unplugged something.', exact: true });
      await expect(offline).toHaveCSS('opacity', '1');
      await expect(offline.getByRole('button')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(offline).toBeVisible(); // Offline deliberately owns an inert Escape.
      await expect(offline.getByRole('button')).toBeFocused();
      await expectOpen(page, true);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(offline).toBeHidden();
    });
  });
}
