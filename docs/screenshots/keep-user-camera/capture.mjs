// Actual Mapbox GL camera checks using an intercepted empty style, never a fake Map.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { NOW, weatherFixture } from '../after-dark-mode/fixtures.mjs';
import { demoVenues } from '../../../src/data/demoVenues.js';

const output = 'docs/screenshots/keep-user-camera';
const baseURL = `http://127.0.0.1:${process.argv[2] || 5195}`;
const location = { lat: -37.8159, lng: 144.9679 };
const style = { version: 8, name: 'Local camera check', sources: {}, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#f4eee1' } },
] };
// A deliberately invalid token is sufficient because every service request is intercepted.
process.env.VITE_MAPBOX_TOKEN = 'pk.keep-user-camera-fixture';
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
const server = await createServer({ server: { port: Number(new URL(baseURL).port), strictPort: true, host: '127.0.0.1', open: false },
  logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
await fs.mkdir(output, { recursive: true });
const observations = [];

// Read the existing imperative API through development React metadata; no hooks/state are patched.
async function attachCamera(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#root')?.firstElementChild;
    if (!root) return false;
    let fiber = root[Object.keys(root).find(key => key.startsWith('__reactFiber$'))];
    while (fiber.return) fiber = fiber.return;
    const pending = [fiber];
    while (pending.length) {
      const node = pending.pop();
      const map = node.ref?.current?.getMap?.();
      if (map) {
        window.__cameraCheck = { map, events: [] };
        for (const type of ['movestart', 'moveend', 'zoomend']) map.on(type, event => {
          window.__cameraCheck.events.push({ type, user: Boolean(event.originalEvent),
            centre: map.getCenter().toArray(), zoom: map.getZoom(), at: performance.now() });
        });
        return true;
      }
      if (node.child) pending.push(node.child);
      if (node.sibling) pending.push(node.sibling);
    }
    return false;
  });
}
const camera = page => page.evaluate(() => {
  const map = window.__cameraCheck.map;
  return { lng: map.getCenter().lng, lat: map.getCenter().lat, zoom: map.getZoom() };
});
const sameCamera = (actual, expected) => {
  assert.ok(Math.abs(actual.lat - expected.lat) < .000001);
  assert.ok(Math.abs(actual.lng - expected.lng) < .000001);
  assert.ok(Math.abs(actual.zoom - expected.zoom) < .000001);
};

try {
  for (const kind of ['normal-load', 'early-locate', 'early-pan', 'early-wheel', 'early-pinch', 'programmatic-move']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      timezoneId: 'Australia/Melbourne', geolocation: { latitude: location.lat, longitude: location.lng },
      permissions: ['geolocation'], serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(NOW);
    await page.addInitScript(() => {
      sessionStorage.setItem('splashShown', 'true');
      sessionStorage.setItem('ss-sunny-advice-shown', '1');
      sessionStorage.setItem('ss-home-sheet-mode', 'sun');
    });
    let releaseStyle;
    const pendingStyle = new Promise(resolve => { releaseStyle = resolve; });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL) return route.continue();
      if (url.origin === 'https://api.open-meteo.com') return route.fulfill({ json: weatherFixture() });
      if (url.hostname.endsWith('mapbox.com')) {
        if (url.pathname.includes('/styles/')) { await pendingStyle; return route.fulfill({ json: style }); }
        return route.fulfill({ json: {} });
      }
      return route.abort('blockedbyclient');
    });
    await page.goto(baseURL);
    await page.getByRole('button', { name: 'Locate Me', exact: true }).waitFor();
    await attachCamera(page);
    assert.equal(await page.evaluate(() => window.__cameraCheck.map.loaded()), false);
    const before = await camera(page);
    if (kind === 'early-locate') {
      await page.getByRole('button', { name: 'Locate Me', exact: true }).tap();
      await expect.poll(async () => Math.abs((await camera(page)).zoom - 14)).toBeLessThan(.000001);
      sameCamera(await camera(page), { ...location, zoom: 14 });
    } else if (['early-pan', 'early-wheel', 'early-pinch'].includes(kind)) {
      // The app loading overlay intercepts physical input until load. An explicit
      // Mapbox event fixture exercises the early listener, then native input is
      // checked below once that overlay has gone. No map or React state is patched.
      await page.evaluate(type => {
        const map = window.__cameraCheck.map;
        map.fire('movestart', { originalEvent: new Event(type) });
        map.jumpTo({ center: [144.971, -37.817], zoom: 14.2 });
      }, kind === 'early-wheel' ? 'wheel' : kind === 'early-pinch' ? 'touchmove' : 'mousemove');
    } else if (kind === 'programmatic-move') {
      await page.evaluate(() => window.__cameraCheck.map.flyTo({ center: [144.98, -37.82], zoom: 14, duration: 0 }));
    }
    await expect.poll(() => page.evaluate(() => window.__cameraCheck.map.isMoving())).toBe(false);
    let chosen = await camera(page);
    if (kind.startsWith('early-') && kind !== 'early-locate') {
      assert.notDeepEqual(chosen, before, 'The early event fixture must choose a distinct camera before load.');
      assert.equal(await page.evaluate(() => window.__cameraCheck.events.some(event => event.type === 'movestart' && event.user)), true);
    }
    releaseStyle();
    await expect.poll(() => page.evaluate(() => window.__cameraCheck.map.loaded()), { timeout: 15_000 }).toBe(true);
    if (['early-pan', 'early-wheel', 'early-pinch'].includes(kind)) {
      sameCamera(await camera(page), chosen);
      const beforeNative = await camera(page);
      if (kind === 'early-pan') {
        await page.mouse.move(180, 360);
        await page.mouse.down();
        await page.mouse.move(270, 430, { steps: 15 });
        await page.mouse.up();
      } else if (kind === 'early-wheel') {
        await page.mouse.move(190, 360);
        await page.mouse.wheel(0, -420);
      } else {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 370, id: 1 }, { x: 230, y: 370, id: 2 }] });
        for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [{ x: 160 - step * 5, y: 370, id: 1 }, { x: 230 + step * 5, y: 370, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      }
      await page.waitForTimeout(1200);
      await expect.poll(() => page.evaluate(() => window.__cameraCheck.map.isMoving())).toBe(false);
      chosen = await camera(page);
      assert.notDeepEqual(chosen, beforeNative, 'Native input must actually change the loaded map camera.');
    }
    // A delayed first-load fit must not undo the user's choice over the next ten seconds.
    await page.waitForTimeout(10_000);
    const final = await camera(page);
    let label = null, venuesInCanvas = null;
    if (kind.startsWith('early-')) sameCamera(final, chosen);
    else {
      assert.ok(final.zoom < 14, 'Untouched/programmatic-only loads still perform the citywide fit.');
      venuesInCanvas = await page.evaluate(venues => {
        const map = window.__cameraCheck.map, canvas = map.getCanvas();
        return venues.filter(venue => Number.isFinite(Number(venue.lat)) && Number.isFinite(Number(venue.lng))).every(venue => {
          const point = map.project([Number(venue.lng), Number(venue.lat)]);
          return point.x >= 0 && point.x <= canvas.clientWidth && point.y >= 0 && point.y <= canvas.clientHeight;
        });
      }, demoVenues);
      assert.equal(venuesInCanvas, true);
    }
    await page.screenshot({ path: `${output}/${kind}-390.png` });
    if (kind === 'early-locate') {
      const mode = page.getByRole('group', { name: 'Home sheet mode', exact: true }).filter({ visible: true });
      await mode.getByRole('button', { name: 'After Dark', exact: true }).tap();
      label = 'Walk times from your location';
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${output}/early-locate-after-dark-390.png` });
    }
    const events = await page.evaluate(() => window.__cameraCheck.events);
    assert.deepEqual(errors, []);
    observations.push({ kind, viewport: { width: 390, height: 844 }, before, chosen, final, secondsAfterLoad: 10,
      venuesInCanvas, label, syntheticPreloadGesture: ['early-pan', 'early-wheel', 'early-pinch'].includes(kind), events, errors });
    console.log(JSON.stringify({ kind, chosen, final, venuesInCanvas, label }));
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
await fs.writeFile(`${output}/observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
