// Local request routing checks; every external request is fulfilled or blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { NOW, weather } from '../../../e2e/fixtures/weather.js';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from '../../../e2e/fixtures/supabase.js';

const output = 'docs/screenshots/weather-function';
const firstPort = Number(process.argv[2] || 5198);
const air = { timezone: 'Australia/Melbourne', utc_offset_seconds: 39600,
  current: { time: '2026-10-19T11:00', pm2_5: 8 },
  hourly: { time: weather.hourly.time, pm2_5: weather.hourly.time.map(() => 8) } };
const observations = [];
// These legacy consumers are not mounted by the current VenueCard. Mount the real
// component and hooks separately, without changing any application source/state.
const probeCode = `import React from 'react';
import { createRoot } from 'react-dom/client';
import HourlyForecastStrip from '/src/components/HourlyForecastStrip.jsx';
import { useAirQuality } from '/src/hooks/useAirQuality.js';
import { useOpenAQ } from '/src/hooks/useOpenAQ.js';
function Probe() {
  const { airQuality, loading } = useAirQuality(-37.8183, 144.9671);
  const { aqLabel } = useOpenAQ(-37.8183, 144.9671);
  return React.createElement('main', null,
    React.createElement('output', { id: 'current-air' }, loading ? 'Loading' : airQuality?.label ?? 'Unavailable'),
    React.createElement('output', { id: 'hourly-air' }, aqLabel),
    React.createElement(HourlyForecastStrip, { lat: -37.8183, lng: 144.9671, venueId: 'local-weather-probe' }));
}
createRoot(document.getElementById('root')).render(React.createElement(Probe));`;
const probePlugin = {
  name: 'local-weather-capture',
  resolveId(id) { if (id === '/__weather-check-entry.js') return '\0weather-check-entry'; },
  load(id) { if (id === '\0weather-check-entry') return probeCode; },
  configureServer(server) {
    server.middlewares.use('/__weather-check', async (req, res) => {
      const html = await server.transformIndexHtml('/__weather-check',
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/__weather-check-entry.js"></script></body></html>');
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    });
  },
};

await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' });
try {
  for (const [index, kind] of ['direct', 'proxy', 'fallback', 'unavailable'].entries()) {
    process.env.VITE_MAPBOX_TOKEN = '';
    process.env.VITE_SUPABASE_URL = kind === 'direct' ? '' : FAKE_SUPABASE_URL;
    process.env.VITE_SUPABASE_ANON_KEY = kind === 'direct' ? '' : FAKE_SUPABASE_ANON_KEY;
    process.env.VITE_OPENAQ_API_KEY = '';
    const port = firstPort + index, baseURL = `http://127.0.0.1:${port}`;
    const server = await createServer({ plugins: [probePlugin], logLevel: 'warn', optimizeDeps: { entries: ['index.html'] },
      server: { port, host: '127.0.0.1', strictPort: true, open: false } });
    await server.listen();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      reducedMotion: 'reduce', timezoneId: 'Australia/Melbourne', serviceWorkers: 'block' });
    try {
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.setFixedTime(NOW);
      await context.routeWebSocket('**', socket => socket.close());
      await page.addInitScript(() => {
        sessionStorage.setItem('splashShown', 'true');
        sessionStorage.setItem('ss-sunny-advice-shown', '1');
        sessionStorage.setItem('ss-home-sheet-mode', 'sun');
      });
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === baseURL) return route.continue();
        if (url.origin === FAKE_SUPABASE_URL && url.pathname === '/functions/v1/weather') {
          const requestKind = url.searchParams.get('kind');
          const headers = request.headers();
          assert.equal(headers.apikey, FAKE_SUPABASE_ANON_KEY);
          assert.equal(headers.authorization, `Bearer ${FAKE_SUPABASE_ANON_KEY}`);
          requests.push({ path: url.pathname, kind: requestKind, anonHeaders: true, method: request.method(),
            lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) });
          if (['fallback', 'unavailable'].includes(kind)) return route.fulfill({ status: 502, json: { error: 'upstream_error' } });
          return route.fulfill({ json: requestKind === 'air' ? air : weather });
        }
        if (['https://api.open-meteo.com', 'https://air-quality-api.open-meteo.com'].includes(url.origin)) {
          requests.push({ host: url.hostname, kind: url.pathname === '/v1/air-quality' ? 'air' : 'forecast', method: request.method() });
          if (kind === 'unavailable') return route.fulfill({ status: 502, json: {} });
          return route.fulfill({ json: url.pathname === '/v1/air-quality' ? air : weather });
        }
        return route.abort('blockedbyclient');
      });
      await page.goto(baseURL);
      await page.getByText('Map failed to load', { exact: true }).waitFor();
      if (kind === 'unavailable') await expect(page.locator('.ss-map-first-weather')).toContainText('Live weather unavailable');
      else await expect(page.locator('.ss-map-first-weather')).toContainText('23°');
      await page.waitForTimeout(300);
      const header = await page.locator('.ss-map-first-weather').innerText();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (kind !== 'fallback') await page.screenshot({ path: `${output}/${kind}-390.png` });
      let cardAir = null, isolatedConsumers = null;
      if (kind === 'proxy') {
        await page.getByRole('button', { name: 'Show venue list', exact: true }).tap();
        const row = page.locator('.ss-mobile-sheet').getByRole('button', { name: /^Venue: / }).first();
        await row.tap();
        await page.getByRole('button', { name: 'Close venue details', exact: true }).waitFor();
        const details = page.getByRole('button', { name: 'UV, air quality and wind comfort', exact: true });
        await details.scrollIntoViewIfNeeded();
        await details.tap();
        await expect(page.getByText('Pristine', { exact: true })).toBeVisible();
        cardAir = await page.getByText('Pristine', { exact: true }).innerText();
        await page.getByText('Pristine', { exact: true }).scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        // The current card uses the actual useOpenAQ hook for this value.
        await page.screenshot({ path: `${output}/proxy-card-air-390.png` });
        await page.goto(`${baseURL}/__weather-check`);
        await expect(page.locator('#current-air')).toHaveText('Pristine');
        await expect(page.locator('#hourly-air')).toHaveText('Pristine');
        await expect(page.locator('[data-render-branch="hourly-forecast-strip"]')).toHaveAttribute('data-forecast-state', 'success');
        isolatedConsumers = { currentAir: 'Pristine', hourlyAir: 'Pristine', hourlyForecast: 'success' };
        assert.deepEqual([...new Set(requests.filter(request => request.path).map(request => request.kind))].sort(), ['air', 'forecast', 'hourly']);
        assert.equal(requests.some(request => request.host), false, 'Successful proxy responses must not fall back to direct Open-Meteo.');
      }
      if (kind === 'direct') assert.equal(requests.some(request => request.path), false);
      if (kind === 'fallback') assert.ok(requests.some(request => request.path) && requests.some(request => request.host));
      assert.deepEqual(errors, []);
      observations.push({ kind, viewport: { width: 390, height: 844 }, header, cardAir, isolatedConsumers, requests, errors });
      console.log(JSON.stringify({ kind, header, cardAir, isolatedConsumers, requestCount: requests.length }));
    } finally { await context.close(); await server.close(); }
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
