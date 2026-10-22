// Real no-token home plus intercepted event responses; run from the repository root.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from '../../../e2e/fixtures/supabase.js';
import { NOW, eventResponse, weatherFixture } from '../after-dark-mode/fixtures.mjs';

const output = 'docs/screenshots/after-dark-walk-origin';
const firstPort = Number(process.argv[2] || 5190);
const expectedOrigin = { lat: -37.8183, lng: 144.9671 };
const label = 'Walk times from Flinders St Station';
const observations = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' });

try {
  for (const [index, kind] of ['no-credentials', 'fixture-events'].entries()) {
    // These settings belong only to this local capture process, never a real project.
    process.env.VITE_MAPBOX_TOKEN = '';
    process.env.VITE_SUPABASE_URL = kind === 'fixture-events' ? FAKE_SUPABASE_URL : '';
    process.env.VITE_SUPABASE_ANON_KEY = kind === 'fixture-events' ? FAKE_SUPABASE_ANON_KEY : '';
    const port = firstPort + index, baseURL = `http://127.0.0.1:${port}`;
    const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', open: false },
      optimizeDeps: { entries: ['index.html'] }, logLevel: 'warn' });
    await server.listen();
    try {
      for (const [width, height] of [[390, 844], [320, 568]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true,
          timezoneId: 'Australia/Melbourne', reducedMotion: 'reduce', serviceWorkers: 'block' });
        const page = await context.newPage();
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.setFixedTime(NOW);
        await context.routeWebSocket('**', socket => socket.close());
        await page.addInitScript(() => {
          sessionStorage.setItem('splashShown', 'true');
          sessionStorage.setItem('ss-sunny-advice-shown', '1');
          sessionStorage.setItem('ss-home-sheet-mode', 'sun');
        });
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin === baseURL) return route.continue();
          if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weatherFixture() });
          if (url.origin === FAKE_SUPABASE_URL && url.pathname === '/functions/v1/events-tonight') {
            requests.push({ lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')),
              radius: Number(url.searchParams.get('radius')) });
            return route.fulfill({ json: eventResponse });
          }
          return route.abort('blockedbyclient');
        });
        await page.goto(baseURL);
        await page.getByText('Map failed to load', { exact: true }).waitFor();
        await page.getByText('14°', { exact: true }).first().waitFor();
        const mode = page.getByRole('group', { name: 'Home sheet mode', exact: true }).filter({ visible: true });
        await mode.getByRole('button', { name: 'After Dark', exact: true }).tap();
        const panel = page.getByRole('region', { name: "Tonight's events", exact: true });
        await expect(panel.getByText(label, { exact: true })).toBeVisible();
        if (kind === 'no-credentials') {
          await expect(panel).toContainText("Can't load tonight's events right now.");
          assert.equal(requests.length, 0, 'Missing credentials must not attempt an events request.');
        } else {
          await expect(panel.getByRole('article').first()).toContainText('7 min walk');
          assert.deepEqual(requests, [{ ...expectedOrigin, radius: 3 }]);
        }
        await page.waitForFunction(() => {
          const sheet = document.querySelector('.ss-mobile-sheet');
          const backdrop = document.querySelector('.ss-mobile-sheet-backdrop');
          return sheet && Math.abs(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42) < 1
            && backdrop && Number(getComputedStyle(backdrop).opacity) >= .999;
        });
        await page.waitForTimeout(150);
        const measured = await page.evaluate(() => ({
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          panelOverflow: [...document.querySelectorAll('.ss-after-dark-panel, .ss-after-dark-event')].some(node => node.scrollWidth > node.clientWidth),
          mapCanvasCount: document.querySelectorAll('.mapboxgl-canvas').length,
          smallControls: [...document.querySelectorAll('.ss-after-dark-panel button, .ss-after-dark-panel a, [aria-label="Home sheet mode"] button')]
            .filter(node => node.checkVisibility({ visibilityProperty: true }))
            .filter(node => node.getBoundingClientRect().height < 44 || node.getBoundingClientRect().width < 44)
            .map(node => node.textContent.trim()),
        }));
        assert.deepEqual(measured, { horizontalOverflow: false, panelOverflow: false, mapCanvasCount: 0, smallControls: [] });
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${output}/${kind}-${width}.png` });
        observations.push({ kind, width, height, label, requests, measured, errors });
        await context.close();
      }
    } finally { await server.close(); }
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
console.log(JSON.stringify(observations, null, 2));
