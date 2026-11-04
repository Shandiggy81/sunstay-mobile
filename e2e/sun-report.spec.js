import { test, expect } from '@playwright/test';
import { NOW, weather } from './fixtures/weather.js';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';

test.use({ viewport: { width: 390, height: 844 } });

test('sun report puts best sides first and keeps year and season details accessible', async ({ page, baseURL }) => {
  const errors = [];
  let realSupabaseRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(NOW);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') {
      return route.fulfill({ json: weather });
    }
    if (url.origin !== FAKE_SUPABASE_URL && url.hostname.endsWith('.supabase.co')) realSupabaseRequests += 1;
    // The smoke build uses the fake Supabase client; its failed reads retain
    // the real repository fallback venues. No other requests leave the browser.
    return route.abort('blockedbyclient');
  });

  await page.goto('/?report=dv-melb-stay-01');
  const report = page.getByRole('dialog', { name: 'Pullman Melbourne City Centre', exact: true });
  await expect(report.getByRole('heading', { level: 1, name: 'Pullman Melbourne City Centre', exact: true })).toBeVisible();
  const back = report.getByRole('button', { name: 'Back', exact: true });
  await expect(back).toBeFocused();
  await expect(page.locator('#root')).toHaveJSProperty('inert', true);

  const summary = report.locator('.ss-sun-report__summary');
  await expect(summary.getByRole('heading', { name: 'Best side today', exact: true })).toBeVisible();
  const moments = summary.getByRole('listitem');
  await expect(moments).toHaveCount(4);
  for (const [index, title] of ['Morning coffee', 'Long lunch', 'Afternoon', 'Sunset drinks'].entries()) {
    await expect(moments.nth(index)).toContainText(title);
  }

  const sides = report.locator('.ss-sun-report__side-toggle');
  await expect(sides.first()).toHaveAttribute('aria-expanded', 'true');
  const firstPanelId = await sides.first().getAttribute('aria-controls');
  const firstPanel = report.locator(`[id="${firstPanelId}"]`);
  const table = firstPanel.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Summer · 15 Jan', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Winter · 15 Jul', exact: true })).toBeVisible();

  const second = sides.nth(1);
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  const secondPanelId = await second.getAttribute('aria-controls');
  const secondPanel = report.locator(`[id="${secondPanelId}"]`);
  await expect(secondPanel).toBeHidden();
  await second.tap();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(secondPanel).toBeVisible();

  const smallText = await report.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const failures = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (!range.getClientRects().length) continue;
      const fontSize = parseFloat(getComputedStyle(node.parentElement).fontSize);
      if (fontSize < 12) failures.push({ text: node.textContent.trim(), fontSize });
    }
    return failures;
  });
  expect(smallText, 'Rendered report text must be at least 12px').toEqual([]);
  expect(await report.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Closed disclosures must still be present in a printed report.
  const panels = report.locator('.ss-sun-report__side-panel');
  await page.emulateMedia({ media: 'print' });
  for (const panel of await panels.all()) await expect(panel).toBeVisible();
  await expect(report.locator('.ss-sun-report__toolbar')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  await back.focus();
  await page.keyboard.press('Escape');
  await expect(report).toBeHidden();
  await expect(page.locator('#root')).toHaveJSProperty('inert', false);
  expect(realSupabaseRequests, 'No request to a real Supabase project').toBe(0);
  expect(errors, 'Unhandled browser errors').toEqual([]);
});
