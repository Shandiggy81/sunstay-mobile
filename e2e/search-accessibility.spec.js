import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

for (const [width, height] of [[320, 568], [390, 844]]) {
  test.describe(`Search and time-control accessibility at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page, baseURL }) => {
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
      await expect(page.locator('.ss-home-weather-card')).toBeEnabled();
    });

    test('the first ArrowUp selects the last suggestion, then arrows wrap', async ({ page }) => {
      const input = page.getByRole('combobox', { name: 'Search venues', exact: true });
      await input.fill('Quest');
      const list = page.getByRole('listbox', { name: 'Search suggestions', exact: true });
      const options = list.getByRole('option');
      await expect(list).toBeVisible();
      await expect(options.last()).toHaveText('Show all results');
      await input.press('ArrowUp');
      await expect(options.last()).toHaveAttribute('aria-selected', 'true');
      await expect(input).toHaveAttribute('aria-activedescendant', await options.last().getAttribute('id'));
      await expect(input).toBeFocused();
      await input.press('ArrowDown');
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
      await input.press('ArrowUp');
      await expect(options.last()).toHaveAttribute('aria-selected', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test('the time trigger name includes its visible value and preserves the dialog name', async ({ page }) => {
      const trigger = page.getByRole('button', { name: 'Now, Preview time', exact: true });
      await expect(trigger).toHaveText('Now');
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Preview time', exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Lunch', exact: true }).click();
      const lunch = page.getByRole('button', { name: 'Lunch, Preview time', exact: true });
      await expect(lunch).toHaveText('Lunch');
      await expect(lunch).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(lunch).toBeFocused();
      await expect(lunch).toHaveAttribute('aria-expanded', 'false');
    });
  });
}
