import { chromium } from '@playwright/test';
import { NOW, weather } from '../../../e2e/fixtures/weather.js';
import fs from 'node:fs/promises';

const phase = process.argv[2] || 'before';
const port = process.argv[3] || '5174';
const baseURL = `http://127.0.0.1:${port}`;
const out = 'docs/screenshots/explore-bright-clay';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
await fs.mkdir(out, { recursive: true });
const observations = [];

async function boot(width, reduce = false) {
  const context = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 1, timezoneId: 'Australia/Melbourne',
    reducedMotion: reduce ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
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
  await page.getByText('23°', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Filters', exact: true }).waitFor();
  await page.waitForTimeout(1700);
  return { page, context, errors };
}

async function capture(page, name) {
  await page.screenshot({ path: `${out}/${phase}-${name}.png` });
}

async function openPreview(page) {
  const selected = await page.evaluate(() => {
    const first = document.querySelector('#root').firstElementChild;
    const key = Object.keys(first).find(key => key.startsWith('__reactFiber$'));
    let root = first[key];
    while (root.return) root = root.return;
    const pending = [root];
    while (pending.length) {
      const fiber = pending.pop();
      const props = fiber.memoizedProps;
      if (props?.venues && props.weatherColorFn && typeof props.onVenueSelect === 'function') {
        const venue = props.venues.find(venue => venue.typeLabel?.toLowerCase().includes('cafe')) ?? props.venues[0];
        props.onVenueSelect(venue);
        return venue.venueName;
      }
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
    }
    return null;
  });
  if (!selected) throw new Error('VenueMap callback was not found');
  await page.getByRole('region', { name: `${selected} preview`, exact: true }).waitFor();
  await page.waitForFunction(() => { const el = document.querySelector('[role=region][aria-label$=preview]'); return el && getComputedStyle(el).opacity === '1'; });
  await page.waitForTimeout(250);
  return selected;
}

for (const width of [320, 390, 768]) {
  const { page, context, errors } = await boot(width);
  await capture(page, `default-${width}`);
  const venue = await openPreview(page);
  await capture(page, `map-preview-${width}`);
  await page.getByRole('button', { name: 'Close venue preview', exact: true }).click();
  await page.locator('.ss-mobile-sheet-handle').click();
  await page.locator('.ss-mobile-sheet .ss-venue-list-card').first().waitFor();
  await page.waitForTimeout(450);
  await capture(page, `list-expanded-${width}`);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = page.locator('.ss-filter-sheet');
  await filters.getByRole('button', { name: 'Cafe', exact: true }).click();
  await filters.getByRole('button', { name: /^Show \d+ venues?$/ }).click();
  await page.locator('.ss-filter-sheet-backdrop').waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  await capture(page, `category-selected-${width}`);
  observations.push({ width, preview: venue, errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    count: await page.locator('.ss-mobile-sheet-head').innerText() });
  await context.close();
}
const { page, context, errors } = await boot(390, true);
await capture(page, 'reduced-motion-390');
observations.push({ reducedMotion: await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), errors });
await context.close();
await browser.close();
await fs.writeFile(`/tmp/explore-${phase}-observations.json`, JSON.stringify(observations, null, 2));
console.log(JSON.stringify(observations, null, 2));
