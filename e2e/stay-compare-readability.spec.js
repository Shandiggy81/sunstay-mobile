import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

for (const [width, height] of [[320, 568], [390, 844]]) {
  test.describe(`Readable stay comparison at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test('one, two and three stays keep their facts, table associations and dialog behavior', async ({ page, baseURL }) => {
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

      await page.goto('/');
      await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
      await page.getByRole('button', { name: /^Morning stays / }).click();
      const list = page.locator('.ss-mobile-sheet');
      for (const count of [1, 2, 3]) {
        const nextStay = list.locator('.ss-stay-compare-toggle[aria-pressed="false"]').first();
        // The short phone mounts only two Virtuoso rows at a time.
        if (await nextStay.count() === 0) {
          await list.locator('[data-virtuoso-scroller]').evaluate(element => element.scrollBy({ top: element.clientHeight, behavior: 'instant' }));
        }
        await nextStay.click();
        const trigger = list.getByRole('button', { name: `Compare (${count}/3)`, exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Compare · Morning coffee', exact: true });
        const close = dialog.getByRole('button', { name: 'Close comparison', exact: true });
        await expect(close).toBeFocused();
        await expect(page.locator('.ss-stay-overlay')).toHaveCSS('opacity', '1');
        await page.evaluate(() => document.fonts.ready);
        const table = dialog.getByRole('table', { name: 'Sunniest side', exact: true });
        await expect(table.getByRole('columnheader')).toHaveCount(count);
        await expect(table.getByRole('rowheader')).toHaveCount(5);
        await expect(table.getByRole('cell')).toHaveCount(count * 5);
        await expect(dialog.getByText('Best stay', { exact: true })).toHaveCount(1);
        for (const fact of ['Sun window', 'Total sun', 'Coffee', 'Sunset', 'Best months']) {
          await expect(table.getByRole('rowheader', { name: fact, exact: true })).toHaveCount(1);
        }
        const cells = await table.locator('td').evaluateAll(elements => elements.map(cell => ({
          text: cell.textContent,
          headers: cell.headers.split(' ').map(id => ({ id, role: document.getElementById(id)?.getAttribute('scope'), text: document.getElementById(id)?.textContent })),
        })));
        for (const cell of cells) {
          expect(cell.text).not.toBe('');
          expect(cell.headers.map(header => header.role)).toEqual(['col', 'rowgroup']);
          expect(cell.headers.every(header => header.text)).toBe(true);
        }
        if (count === 3) {
          const metrics = await dialog.evaluate(element => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const tooSmall = [];
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent.trim() || node.parentElement.closest('svg')) continue;
              const range = document.createRange(); range.selectNodeContents(node);
              if (range.getClientRects().length && parseFloat(getComputedStyle(node.parentElement).fontSize) < 12) tooSmall.push(node.textContent);
            }
            return {
              tooSmall,
              overflow: [element, ...element.querySelectorAll('*')].filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth).map(el => ({ tag: el.tagName, text: el.textContent })),
              nameTops: [...element.querySelectorAll('.ss-stay-venue-name')].map(el => el.getBoundingClientRect().top),
            };
          });
          expect(metrics.tooSmall).toEqual([]);
          expect(metrics.overflow).toEqual([]);
          expect(new Set(metrics.nameTops).size).toBe(1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await expect(dialog.getByRole('heading', { name: 'Compare · Morning coffee' })).toHaveCSS('font-size', '17px');
          await expect(dialog.getByText('Best stay', { exact: true })).toHaveCSS('color', 'rgb(146, 64, 14)');
          // A single close control must retain focus in either Tab direction.
          await page.keyboard.press('Tab');
          await expect(close).toBeFocused();
          await page.keyboard.press('Shift+Tab');
          await expect(close).toBeFocused();
          await expect(page.locator('#root')).toHaveJSProperty('inert', true);
          expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await expect(page.locator('#root')).toHaveJSProperty('inert', false);
      }
      expect(errors).toEqual([]);
    });
  });
}
