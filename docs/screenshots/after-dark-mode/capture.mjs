// Deterministic mobile checks of the real After Dark sheet and client fetch helper.
// Run from the repository root: node docs/screenshots/after-dark-mode/capture.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from '../../../e2e/fixtures/supabase.js';
import { NOW, NIGHT, eventResponse, weatherFixture } from './fixtures.mjs';

process.env.VITE_SUPABASE_URL = FAKE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = FAKE_SUPABASE_ANON_KEY;
const output = 'docs/screenshots/after-dark-mode';
const port = Number(process.argv[2] || 5188);
const baseURL = `http://127.0.0.1:${port}`;
const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', open: false },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' });
const observations = [];
await fs.mkdir(output, { recursive: true });

const modeGroup = page => page.getByRole('group', { name: 'Home sheet mode', exact: true }).filter({ visible: true });
const modeButton = (page, name) => modeGroup(page).getByRole('button', { name, exact: true });
const panel = page => page.getByRole('region', { name: "Tonight's events", exact: true });

async function boot(width, height, { kind = 'events', night = false, storedMode = null, blockStorage = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true,
    timezoneId: 'Australia/Melbourne', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [], eventRequests = [], aborted = [];
  const control = { kind, pending: [] };
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (request.url().includes('/functions/v1/events-tonight')) aborted.push(request.failure()?.errorText); });
  await page.clock.setFixedTime(night ? NIGHT : NOW);
  await context.routeWebSocket('**', socket => socket.close());
  await page.addInitScript(({ storedMode, blockStorage }) => {
    sessionStorage.setItem('splashShown', 'true');
    sessionStorage.setItem('ss-sunny-advice-shown', '1');
    if (storedMode) sessionStorage.setItem('ss-home-sheet-mode', storedMode);
    if (blockStorage) {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key === 'ss-home-sheet-mode') throw new Error('Fixture: storage denied'); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (key === 'ss-home-sheet-mode') throw new Error('Fixture: storage denied'); return set.call(this, key, value); };
    }
  }, { storedMode, blockStorage });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weatherFixture(night) });
    if (url.origin === FAKE_SUPABASE_URL && url.pathname === '/functions/v1/events-tonight') {
      eventRequests.push({ lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')), radius: url.searchParams.get('radius'),
        start: url.searchParams.get('start'), end: url.searchParams.get('end') });
      if (control.kind === 'pending') {
        control.pending.push(route);
        return;
      }
      if (control.kind === 'network') return route.abort('failed');
      if (control.kind === 'error') return route.fulfill({ status: 429, json: { error: 'quota_exhausted' } });
      return route.fulfill({ json: control.kind === 'empty' ? { fetchedAt: eventResponse.fetchedAt, _embedded: { events: [] } } : eventResponse });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Filters', exact: true }).waitFor();
  await page.getByText('14°', { exact: true }).first().waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ss-map-first-topbar')).opacity === '1');
  await expect(modeGroup(page)).toBeVisible();
  return { page, context, errors, eventRequests, aborted, control };
}

async function settleSheet(page) {
  await expect(page.locator('.ss-mobile-sheet')).toBeVisible();
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.ss-mobile-sheet');
    const backdrop = document.querySelector('.ss-mobile-sheet-backdrop');
    return sheet && Math.abs(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42) < 1
      && backdrop && Number(getComputedStyle(backdrop).opacity) >= .999;
  });
  await page.waitForTimeout(150);
}

async function openAfterDark(page) {
  await modeButton(page, 'After Dark').tap();
  await expect(modeButton(page, 'After Dark')).toHaveAttribute('aria-pressed', 'true');
  await settleSheet(page);
  await expect(panel(page)).toBeVisible();
}

async function setMapCentre(page, origin) {
  const result = await page.evaluate(origin => {
    const first = document.querySelector('#root').firstElementChild;
    let fiber = first[Object.keys(first).find(key => key.startsWith('__reactFiber$'))];
    while (fiber.return) fiber = fiber.return;
    const pending = [fiber];
    while (pending.length) {
      const node = pending.pop();
      if (typeof node.memoizedProps?.value?.setBbox === 'function') {
        node.memoizedProps.value.setBbox({ minLat: origin.lat - .01, maxLat: origin.lat + .01, minLng: origin.lng - .01, maxLng: origin.lng + .01 });
        return true;
      }
      if (node.child) pending.push(node.child);
      if (node.sibling) pending.push(node.sibling);
    }
    return false;
  }, origin);
  assert.equal(result, true, 'Existing viewport context action must be available.');
}

async function measure(page) {
  return page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    panelOverflow: [...document.querySelectorAll('.ss-after-dark-panel, .ss-after-dark-event')].some(node => node.scrollWidth > node.clientWidth),
    visibleFlatIcons: [...document.querySelectorAll('.ss-after-dark-panel svg')].filter(node => node.checkVisibility()).length,
    smallControls: [...document.querySelectorAll('.ss-after-dark-panel button, .ss-after-dark-panel a, [aria-label="Home sheet mode"] button')]
      .filter(node => node.checkVisibility({ visibilityProperty: true }))
      .filter(node => node.getBoundingClientRect().height < 44 || node.getBoundingClientRect().width < 44)
      .map(node => ({ text: node.textContent.trim(), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
  }));
}

try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    for (const kind of ['events', 'empty', 'error']) {
      const run = await boot(width, height, { kind });
      const { page, context, eventRequests, errors } = run;
      await expect(modeButton(page, 'Sun')).toHaveAttribute('aria-pressed', 'true');
      assert.equal(eventRequests.length, 0, 'Sun peek must not fetch events.');
      await openAfterDark(page);
      if (kind === 'events') {
        const first = panel(page).getByRole('article', { name: 'Evening jazz (18+ Event)', exact: true });
        await expect(first).toBeVisible();
        await expect(first).toContainText('18+');
        await expect(first).toContainText('From $45');
        await expect(first).toContainText('7pm');
        await expect(first).toContainText(/\d+ min walk/);
        await expect(first).toContainText('14° · dry · breezy');
        await expect(first).toContainText('Fireplace at CQ City Bar, 0 m away');
        await expect(first.getByRole('link', { name: 'Tickets on Ticketmaster', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(first.getByRole('link', { name: 'Tickets on Ticketmaster', exact: true })).toHaveAttribute('target', '_blank');
        const unknown = panel(page).getByRole('article', { name: 'City comedy late show', exact: true });
        await expect(unknown).not.toContainText('From $');
        await expect(panel(page).locator('.ss-after-dark-source')).toContainText('Events from Ticketmaster');
        await page.screenshot({ path: `${output}/events-${width}.png` });
        await first.getByRole('link', { name: 'Tickets on Ticketmaster', exact: true }).scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${output}/event-details-${width}.png` });
        await panel(page).getByRole('button', { name: 'Comedy', exact: true }).tap();
        await expect(panel(page).getByRole('article')).toHaveCount(1);
        await expect(panel(page).getByRole('article')).toContainText('City comedy late show');
        await panel(page).getByRole('button', { name: 'All', exact: true }).tap();
        await panel(page).getByRole('button', { name: 'Free', exact: true }).tap();
        await expect(panel(page).getByRole('article')).toHaveCount(1);
        await expect(panel(page).getByRole('article')).toContainText('Family theatre night');
        await panel(page).getByRole('button', { name: 'Free', exact: true }).tap();
        assert.equal(eventRequests.length, 1, 'Local category/free filters must not refetch.');
        const origin = eventRequests[0];
        await modeButton(page, 'Sun').tap();
        await expect(page.getByRole('heading', { name: 'Venues', exact: true })).toBeVisible();
        await modeButton(page, 'After Dark').tap();
        await expect(first).toBeVisible();
        assert.equal(eventRequests.length, 1, 'Reopening at the same centre must use cache.');
        await setMapCentre(page, { lat: origin.lat + .004, lng: origin.lng });
        await page.waitForTimeout(400);
        assert.equal(eventRequests.length, 1, 'Movement under 1km must use cache.');
        await setMapCentre(page, { lat: origin.lat + .02, lng: origin.lng });
        await expect.poll(() => eventRequests.length).toBe(2);
        await expect(first).toBeVisible();
      } else if (kind === 'empty') {
        await expect(panel(page)).toContainText('No shows listed near here tonight.');
        await expect(panel(page).getByRole('button', { name: /Cosy spots/i })).toBeVisible();
        await expect(panel(page).getByRole('button', { name: /Cosy spots/i })).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: `${output}/empty-${width}.png` });
        await panel(page).getByRole('button', { name: /Cosy spots/i }).tap();
        await expect(modeButton(page, 'Sun')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('heading', { name: 'Venues', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Cozy spots/i })).toHaveAttribute('aria-pressed', 'true');
      } else {
        await expect(panel(page)).toContainText("Can't load tonight's events right now.");
        await expect(panel(page).getByRole('button', { name: 'Retry', exact: true })).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: `${output}/error-${width}.png` });
        run.control.kind = 'events';
        await panel(page).getByRole('button', { name: 'Retry', exact: true }).tap();
        await expect(panel(page).getByRole('article')).toHaveCount(4);
        assert.equal(eventRequests.length, 2, 'Retry makes exactly one new request.');
      }
      const measurements = await measure(page);
      assert.deepEqual(measurements, { horizontalOverflow: false, panelOverflow: false, visibleFlatIcons: 0, smallControls: [] });
      assert.deepEqual(errors, []);
      observations.push({ width, height, kind, eventRequests, measurements, errors });
      await context.close();
    }
  }

  // Keep a request pending so closing the sheet exercises the AbortController.
  {
    const run = await boot(390, 844, { kind: 'pending' });
    const { page, context, eventRequests } = run;
    await openAfterDark(page);
    await expect.poll(() => eventRequests.length).toBe(1);
    await page.screenshot({ path: `${output}/loading-390.png` });
    await page.locator('.ss-mobile-sheet-backdrop').evaluate(node => node.click());
    await expect(page.locator('.ss-mobile-sheet')).toHaveCount(0);
    await expect.poll(() => run.aborted.length).toBe(1);
    run.control.kind = 'events';
    await page.getByRole('button', { name: "Show tonight's events", exact: true }).tap();
    await expect(panel(page).getByRole('article')).toHaveCount(4);
    assert.equal(eventRequests.length, 2, 'Aborting must not poison cache.');
    observations.push({ kind: 'abort-close', requestCount: eventRequests.length, aborted: run.aborted, errors: run.errors });
    await context.close();
  }

  for (const blockStorage of [false, true]) {
    const run = await boot(390, 844, { night: true, blockStorage });
    await expect(modeButton(run.page, 'After Dark')).toHaveAttribute('aria-pressed', 'true');
    assert.equal(run.eventRequests.length, 0, 'Night default must not fetch while sheet is closed.');
    await modeButton(run.page, 'Sun').tap();
    await expect(modeButton(run.page, 'Sun')).toHaveAttribute('aria-pressed', 'true');
    if (!blockStorage) {
      await run.page.reload();
      await expect(modeButton(run.page, 'Sun')).toHaveAttribute('aria-pressed', 'true');
    }
    assert.deepEqual(run.errors, []);
    observations.push({ kind: blockStorage ? 'storage-denied' : 'night-session-choice', errors: run.errors, requestCount: run.eventRequests.length });
    await run.context.close();
  }

  {
    const run = await boot(390, 844, { kind: 'network' });
    await openAfterDark(run.page);
    await expect(panel(run.page)).toContainText("Can't load tonight's events right now.");
    run.control.kind = 'empty';
    await panel(run.page).getByRole('button', { name: 'Retry', exact: true }).tap();
    await expect(panel(run.page)).toContainText('No shows listed near here tonight.');
    assert.equal(run.eventRequests.length, 2);
    assert.deepEqual(run.errors, []);
    observations.push({ kind: 'network-error-retry', requestCount: run.eventRequests.length, errors: run.errors });
    await run.context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
await fs.writeFile(`${output}/observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
console.log(JSON.stringify(observations, null, 2));
