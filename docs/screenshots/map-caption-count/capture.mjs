// Capture the real home caption on a browser-only loaded-map fixture, without tiles/pins.
// Run `node docs/screenshots/map-caption-count/capture.mjs before|after` from the repo root.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { NOW, weather } from '../../../e2e/fixtures/weather.js';

const phase = process.argv[2];
assert.ok(['before', 'after'].includes(phase), 'Pass before or after.');
const baseURL = `http://127.0.0.1:${process.argv[3] || '5173'}`;
const output = 'docs/screenshots/map-caption-count';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' });
const observations = [];

// Existing development React state is used only by this browser harness. App code is untouched.
async function fixture(page, { loaded = false, emptyBbox = false } = {}) {
  const result = await page.evaluate(({ loaded, emptyBbox }) => {
    const first = document.querySelector('#root').firstElementChild;
    let fiber = first[Object.keys(first).find(key => key.startsWith('__reactFiber$'))];
    while (fiber.return) fiber = fiber.return;
    const pending = [fiber];
    const bbox = emptyBbox
      ? { minLng: 144.5, minLat: -38.2, maxLng: 144.51, maxLat: -38.19 }
      : { minLng: 144.5, minLat: -38.2, maxLng: 145.5, maxLat: -37.5 };
    let reported = false;
    while (pending.length) {
      const node = pending.pop();
      if (!reported && typeof node.memoizedProps?.value?.setBbox === 'function') {
        node.memoizedProps.value.setBbox(bbox);
        reported = true;
      }
      if (node.memoizedProps?.weatherColorFn && node._debugHookTypes) {
        if (!reported) return { error: 'Microclimate context not found before VenueMap' };
        if (loaded) {
          const types = node._debugHookTypes.filter(type => type !== 'useContext');
          const hooks = [];
          for (let hook = node.memoizedState; hook; hook = hook.next) hooks.push(hook);
          const states = hooks.filter((_, index) => types[index] === 'useState');
          const [prompt, mapLoaded, mapError] = states.slice(6, 9);
          if (prompt?.memoizedState !== null || mapLoaded?.memoizedState !== false || mapError?.memoizedState !== true) {
            return { error: 'VenueMap state order changed' };
          }
          mapLoaded.queue.dispatch(true);
          mapError.queue.dispatch(false);
        }
        return { ok: true };
      }
      if (node.child) pending.push(node.child);
      if (node.sibling) pending.push(node.sibling);
    }
    return { error: 'VenueMap not found' };
  }, { loaded, emptyBbox });
  assert.deepEqual(result, { ok: true });
  await page.waitForTimeout(400);
}

try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true,
      timezoneId: 'Australia/Melbourne', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(NOW);
    await context.routeWebSocket('**', socket => socket.close());
    await page.addInitScript(() => { sessionStorage.setItem('splashShown', 'true'); sessionStorage.setItem('ss-sunny-advice-shown', '1'); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
      return route.abort('blockedbyclient');
    });
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'Filters', exact: true }).waitFor();
    await page.waitForFunction(() => /\d°/.test(document.querySelector('.ss-map-first-weather')?.textContent ?? ''));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ss-map-first-topbar')).opacity === '1');
    await page.getByText('Map failed to load', { exact: true }).waitFor();
    await fixture(page, { loaded: true });
    const caption = page.locator('.ss-map-caption-inner');
    await expect(caption).toBeVisible();
    await expect(caption.getByRole('img', { name: /Live/ })).toBeVisible();
    const text = (await caption.innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(/\d[\d,]* venues/.test(text), phase === 'before');
    const measured = await page.evaluate(() => {
      const caption = document.querySelector('.ss-map-caption-inner');
      const rect = caption.getBoundingClientRect();
      const sheet = document.querySelector('.ss-mobile-sheet-handle').getBoundingClientRect();
      return { text: caption.innerText.replace(/\s+/g, ' ').trim(), rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        sheetTop: sheet.top, sheetText: document.querySelector('.ss-home-peek-headline')?.textContent.trim(),
        expandedSheet: Boolean(document.querySelector('.ss-mobile-sheet')),
        mapCanvasCount: document.querySelectorAll('.mapboxgl-canvas').length,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(measured.expandedSheet, false);
    assert.equal(measured.mapCanvasCount, 0, 'Fixture must not create a Mapbox map.');
    assert.equal(measured.horizontalOverflow, false);
    assert.ok(measured.rect.left >= 16 && measured.rect.right < width);
    assert.ok(measured.rect.bottom <= measured.sheetTop);
    await page.screenshot({ path: `${output}/${phase}-${width}.png` });
    const checks = {};
    if (phase === 'after') {
      await fixture(page, { emptyBbox: true });
      await expect(page.locator('.ss-map-caption')).toHaveCount(0);
      checks.emptyCaptionAbsent = true;
      const cozy = page.getByRole('button', { name: /Cozy spots/ });
      await cozy.click();
      // Selecting an experience opens the existing list; tap its scrim to return to peek.
      await page.locator('.ss-mobile-sheet-backdrop').evaluate(el => el.click());
      await page.locator('.ss-mobile-sheet-backdrop').waitFor({ state: 'detached' });
      await expect(page.locator('.ss-map-caption')).toBeVisible();
      await expect(page.locator('.ss-map-caption')).toContainText('Cozy filter on');
      const cozyText = (await page.locator('.ss-map-caption-inner').innerText()).trim();
      assert.equal(cozyText, 'Cozy filter on');
      checks.cozyOnly = cozyText;
      await fixture(page);
      await expect(page.locator('.ss-map-caption-inner').getByRole('img', { name: /Live/ })).toBeVisible();
      await expect(page.locator('.ss-map-caption')).toContainText('Cozy filter on');
      checks.badgeAndCozy = (await page.locator('.ss-map-caption-inner').innerText()).replace(/\s+/g, ' ').trim();
    }
    assert.deepEqual(errors, []);
    observations.push({ width, height, ...measured, checks, errors });
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/${phase}-observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
console.log(JSON.stringify(observations, null, 2));
