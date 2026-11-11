import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

for (const [width, height] of [[320, 568], [390, 844]]) {
  test.describe(`Hourly forecast disclosure at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test('expanded state and controlled strip match the visible hours', async ({ page, baseURL }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
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
        if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
        return route.abort('blockedbyclient');
      });

      await page.goto('/?venue=dv-14');
      const card = page.getByRole('article', { name: 'Industry Beans Fitzroy', exact: true });
      await card.getByRole('button', { name: 'UV, air quality and wind comfort', exact: true }).click();
      const expand = card.getByRole('button', { name: 'Show full 24 hours', exact: true });
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      const stripId = await expand.getAttribute('aria-controls');
      expect(stripId).toBeTruthy();
      const strip = card.locator(`[id="${stripId}"]`);
      await expect(strip.locator('.hourly-item')).toHaveCount(12);

      await expand.focus();
      await page.keyboard.press('Enter');
      const collapse = card.getByRole('button', { name: 'Show less', exact: true });
      await expect(collapse).toHaveAttribute('aria-expanded', 'true');
      await expect(collapse).toHaveAttribute('aria-controls', stripId);
      await expect(collapse).toBeFocused();
      await expect(strip.locator('.hourly-item')).toHaveCount(24);

      await collapse.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      await expect(expand).toHaveAttribute('aria-controls', stripId);
      await expect(strip.locator('.hourly-item')).toHaveCount(12);
      expect(errors, 'Unhandled browser errors').toEqual([]);
    });
  });
}
