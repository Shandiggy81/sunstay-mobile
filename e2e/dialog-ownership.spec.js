import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';

const offlineDialog = page => page.getByRole('dialog', { name: 'Oops! Brucey unplugged something.', exact: true });

async function interruptWithOffline(page, underlyingClose) {
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const offline = offlineDialog(page);
  const retry = offline.getByRole('button');
  await expect(offline).toHaveCSS('opacity', '1');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(offline).toBeVisible();
  await expect(retry).toBeFocused();
  await expect(underlyingClose).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(retry).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(offline).toBeHidden();
  await expect(underlyingClose).toBeFocused();
}

for (const [width, height] of [[320, 568], [390, 844]]) {
  test.describe(`Dialog keyboard ownership at ${width}px`, () => {
    test.use({ viewport: { width, height } });
    let errors;

    test.beforeEach(async ({ page, baseURL }) => {
      errors = [];
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
      await expect(page.locator('.ss-home-weather-card')).toBeEnabled();
    });

    test.afterEach(() => expect(errors).toEqual([]));

    test('Filters stays open behind offline and restores its own opener after reconnecting', async ({ page }) => {
      const opener = page.getByRole('button', { name: 'Filters', exact: true });
      await opener.click();
      const filters = page.getByRole('dialog', { name: 'Filters', exact: true });
      const close = filters.getByRole('button', { name: 'Close filters', exact: true });
      await expect(filters).toHaveCSS('transform', 'none');
      await expect(close).toBeFocused();
      await interruptWithOffline(page, close);
      await page.keyboard.press('Escape');
      await expect(filters).toBeHidden();
      await expect(opener).toBeFocused();
    });

    test('Compare keeps its focus and scroll lock behind offline', async ({ page }) => {
      await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
      await page.getByRole('button', { name: /^Morning stays / }).click();
      const list = page.locator('.ss-mobile-sheet');
      await list.locator('.ss-stay-compare-toggle').first().click();
      const opener = list.getByRole('button', { name: 'Compare (1/3)', exact: true });
      await opener.click();
      const comparison = page.getByRole('dialog', { name: 'Compare · Morning coffee', exact: true });
      const close = comparison.getByRole('button', { name: 'Close comparison', exact: true });
      await expect(close).toBeFocused();
      await interruptWithOffline(page, close);
      await expect(page.locator('#root')).toHaveJSProperty('inert', true);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      await page.keyboard.press('Escape');
      await expect(comparison).toBeHidden();
      await expect(opener).toBeFocused();
      await expect(page.locator('#root')).toHaveJSProperty('inert', false);
    });

    test('Escape closes Filters before an already open Preview time popover', async ({ page }) => {
      const preview = page.locator('.ss-home-time > button');
      await preview.focus();
      await page.keyboard.press('Enter');
      const time = page.getByRole('dialog', { name: 'Preview time', exact: true });
      await expect(time).toBeVisible();
      const filtersButton = page.getByRole('button', { name: 'Filters', exact: true });
      await filtersButton.focus();
      await page.keyboard.press('Enter');
      const filters = page.getByRole('dialog', { name: 'Filters', exact: true });
      await expect(filters).toHaveCSS('transform', 'none');
      await page.keyboard.press('Escape');
      await expect(filters).toBeHidden();
      await expect(filtersButton).toBeFocused();
      await expect(time).toBeVisible();
      await expect(preview).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(time).toBeHidden();
      await expect(preview).toBeFocused();
    });

    test('a covered popover cannot return focus behind the offline modal', async ({ page }) => {
      const preview = page.locator('.ss-home-time > button');
      await preview.focus();
      await page.keyboard.press('Enter');
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      const offline = offlineDialog(page);
      const retry = offline.getByRole('button');
      await expect(retry).toBeFocused();
      // Background mousedown can blur Retry before the popover's outside handler.
      await page.mouse.click(5, 5);
      await expect(preview).toHaveAttribute('aria-expanded', 'false');
      await expect(preview).not.toBeFocused();
      await expect(offline).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(retry).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(retry).toBeFocused();
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(offline).toBeHidden();
      await expect(preview).toBeFocused();
    });

    for (const order of [['time', 'info'], ['info', 'time']]) {
      test(`Escape closes one popover at a time when opening ${order.join(' then ')}`, async ({ page }) => {
        const popovers = {
          time: {
            trigger: page.locator('.ss-home-time > button'),
            panel: page.getByRole('dialog', { name: 'Preview time', exact: true }),
          },
          info: {
            trigger: page.getByRole('button', { name: 'About this map preview', exact: true }),
            panel: page.getByRole('dialog', { name: 'About this map preview', exact: true }),
          },
        };
        const [first, last] = order.map(key => popovers[key]);
        // Keyboard activation produces no outside pointerup to close the first layer.
        for (const popover of [first, last]) {
          await popover.trigger.focus();
          await page.keyboard.press('Enter');
          await expect(popover.panel).toBeVisible();
          await expect(popover.trigger).toHaveAttribute('aria-expanded', 'true');
        }
        await expect(first.panel).toBeVisible();
        await expect(last.trigger).toBeFocused();

        await page.keyboard.press('Escape');
        await expect(last.panel).toBeHidden();
        await expect(last.trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(last.trigger).toBeFocused();
        await expect(first.panel).toBeVisible();
        await expect(first.trigger).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Escape');
        await expect(first.panel).toBeHidden();
        await expect(first.trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(first.trigger).toBeFocused();
        await expect(last.panel).toBeHidden();
      });
    }

    test('Escape follows focus or the topmost popover and outside clicks still work', async ({ page }) => {
      const time = { trigger: page.locator('.ss-home-time > button'), panel: page.getByRole('dialog', { name: 'Preview time', exact: true }) };
      const info = { trigger: page.getByRole('button', { name: 'About this map preview', exact: true }), panel: page.getByRole('dialog', { name: 'About this map preview', exact: true }) };
      for (const focus of ['older', 'background']) {
        for (const popover of [time, info]) {
          await popover.trigger.focus();
          await page.keyboard.press('Enter');
          await expect(popover.panel).toBeVisible();
        }
        if (focus === 'older') await time.trigger.focus();
        else await page.evaluate(() => document.activeElement?.blur());
        const [owner, remaining] = focus === 'older' ? [time, info] : [info, time];
        await page.keyboard.press('Escape');
        await expect(owner.panel).toBeHidden();
        await expect(owner.trigger).toBeFocused();
        await expect(remaining.panel).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(remaining.panel).toBeHidden();
        await expect(remaining.trigger).toBeFocused();
      }

      await time.trigger.click();
      await expect(time.panel).toBeVisible();
      await info.trigger.click();
      await expect(time.panel).toBeHidden();
      await expect(info.panel).toBeVisible();
      await expect(info.trigger).toBeFocused();
      await page.mouse.click(5, 230);
      await expect(info.panel).toBeHidden();
    });
  });
}
