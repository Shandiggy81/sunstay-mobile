import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

for (const [width, height] of [[320, 568], [390, 844]]) {
  test.describe(`Mobile legibility and keyboard navigation at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page, baseURL }) => {
      // Keep native timers/animation frames advancing while fixing the test date.
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
    });

    test('weather and stay-moment facts fit without ellipsis', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.ss-home-wind-copy > span')).toContainText('7');
      await page.evaluate(() => document.fonts.ready);
      const wind = await page.locator('.ss-home-wind-copy > span').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
      expect(wind.content).toBeLessThanOrEqual(wind.width);

      await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
      await page.getByRole('button', { name: /^Morning stays / }).click();
      const badge = page.locator('.ss-mobile-sheet .ss-stay-badge').first();
      await expect(badge).toContainText('Level');
      const size = await badge.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth, wrap: getComputedStyle(el).whiteSpace }));
      expect(size.wrap).toBe('normal');
      expect(size.content).toBeLessThanOrEqual(size.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test('the unavailable-weather message is completely readable', async ({ page }) => {
      await page.route('https://api.open-meteo.com/v1/forecast?**', route => route.fulfill({ status: 503, json: { error: 'fixture unavailable' } }));
      await page.goto('/');
      const condition = page.locator('.ss-home-weather-copy > span');
      await expect(condition).toHaveText('Live weather unavailable', { timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      const size = await condition.evaluate(el => {
        const card = el.closest('.ss-home-weather-card').getBoundingClientRect();
        const text = el.getBoundingClientRect();
        return { width: el.clientWidth, content: el.scrollWidth, bottom: text.bottom, cardBottom: card.bottom };
      });
      expect(size.content).toBeLessThanOrEqual(size.width);
      expect(size.bottom).toBeLessThanOrEqual(size.cardBottom);
    });

    test('venue card receives, contains and returns keyboard focus', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
      const row = page.locator('.ss-mobile-sheet').getByRole('button', { name: /^Venue: / }).first();
      await row.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: / details$/ });
      const close = dialog.getByRole('button', { name: 'Close venue details', exact: true });
      await expect(close).toBeFocused();
      await expect(dialog).toHaveCSS('opacity', '1');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('link', { name: 'Get directions', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      // Opening a card collapses the mobile list, so return to its stable handle.
      await expect(page.getByRole('button', { name: 'Show venue list', exact: true })).toBeFocused();
    });

    test('matching-room scrolling keeps focus on the visible close control', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
      await page.getByRole('button', { name: /^Morning stays / }).click();
      const row = page.locator('.ss-mobile-sheet').getByRole('button', { name: /^Venue: Quest St Kilda Bayside/ });
      await row.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Quest St Kilda Bayside details', exact: true });
      await expect(dialog.locator('[data-matching-room="true"]')).toBeInViewport();
      const close = dialog.getByRole('button', { name: 'Close venue details', exact: true });
      await expect(close).toBeFocused();
      await expect(close).toBeInViewport();
      await expect(dialog.locator('.ss-venue-toolbar')).toHaveAttribute('aria-hidden', 'true');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.ss-venue-toolbar')))).toBe(false);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });

    test('the nested Sun Report keeps its own focus and Escape behaviour', async ({ page }) => {
      await page.goto('/?venue=dv-melb-stay-01');
      const card = page.getByRole('dialog', { name: 'Pullman Melbourne City Centre details', exact: true });
      const openReport = card.getByRole('button', { name: 'See the sun report', exact: true });
      await openReport.click();
      const report = page.getByRole('dialog', { name: 'Pullman Melbourne City Centre', exact: true });
      await expect(report.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(report).toBeHidden();
      await expect(card).toBeVisible();
      await expect(openReport).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(card).toBeHidden();
    });
  });
}
