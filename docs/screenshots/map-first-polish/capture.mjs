// Map-first polish captures. Run from the repository root:
//   node docs/screenshots/map-first-polish/capture.mjs
// Starts its own Vite dev server (port 5182) with the repository config and env.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import { NOW, weather } from '../../../e2e/fixtures/weather.js';

const out = 'docs/screenshots/map-first-polish';
const PORT = 5182;
const baseURL = `http://127.0.0.1:${PORT}`;

const hourly = patch => Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, weather.hourly.time.map(() => value)]));
const forecast = (current, hours) => ({ ...weather, current: { ...weather.current, ...current }, hourly: { ...weather.hourly, ...hourly(hours) } });
const FORECASTS = {
  clear: weather,
  foggy: forecast({ weather_code: 45, temperature_2m: 14, apparent_temperature: 13, cloud_cover: 100, shortwave_radiation: 60, relative_humidity_2m: 97 },
    { weather_code: 45, cloud_cover: 100, shortwave_radiation: 60 }),
  rainy: forecast({ weather_code: 61, temperature_2m: 15, apparent_temperature: 13, cloud_cover: 100, shortwave_radiation: 90, precipitation: 1.4 },
    { weather_code: 61, cloud_cover: 100, shortwave_radiation: 90, precipitation_probability: 90, precipitation: 1.4 }),
};

const server = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1', open: false }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
await fs.mkdir(out, { recursive: true });
const observations = [];

async function boot(width, { sky = 'clear', scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: scale, timezoneId: 'Australia/Melbourne', reducedMotion: 'no-preference', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(NOW);
  await context.routeWebSocket('**', socket => socket.close());
  await page.addInitScript(() => { sessionStorage.setItem('splashShown', 'true'); sessionStorage.setItem('ss-sunny-advice-shown', '1'); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: FORECASTS[sky] });
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL);
  await page.waitForFunction(() => /\d°/.test(document.querySelector('.ss-map-first-weather')?.textContent ?? ''));
  await page.getByRole('button', { name: 'Filters', exact: true }).waitFor();
  // The top bar fades in; a cold dev server can reload once while optimising dependencies.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ss-map-first-topbar')).opacity === '1');
  await page.waitForTimeout(1700);
  return { page, context, errors };
}

const shot = (page, name, options = {}) => page.screenshot({ path: `${out}/${name}.png`, ...options });

/** Drag the peek header up with a real pointer, as the map-first-home harness does. */
async function expandSheet(page, width) {
  const handle = await page.getByRole('button', { name: 'Show venue list', exact: true }).boundingBox();
  await page.mouse.move(width / 2, handle.y + 9);
  await page.mouse.down();
  await page.mouse.move(width / 2, handle.y + 9 - 190, { steps: 12 });
  await page.mouse.up();
  await page.locator('.ss-mobile-sheet .ss-venue-list-card').first().waitFor();
  await page.waitForTimeout(850);
}

/**
 * Browser-only UI fixture: no Mapbox token is configured, so the map never loads and its
 * overlays never render. This flips VenueMap's existing mapLoaded/mapError state, sets its
 * existing areaPrompt (what a user pan sets) and reports a viewport through the existing
 * MicroclimateContext setBbox (what the map's moveend does), so the real "Search this area"
 * button and map caption, with its data badge, render on a blank map surface.
 * No map, tiles or pins are simulated.
 */
async function mountOverlayFixture(page) {
  const result = await page.evaluate(() => {
    const first = document.querySelector('#root').firstElementChild;
    let fiber = first[Object.keys(first).find(key => key.startsWith('__reactFiber$'))];
    while (fiber.return) fiber = fiber.return;
    const pending = [fiber];
    const viewport = { minLng: 144.5, minLat: -38.3, maxLng: 145.6, maxLat: -37.5 };
    let reported = false;
    while (pending.length) {
      const node = pending.pop();
      if (!reported && typeof node.memoizedProps?.value?.setBbox === 'function') {
        node.memoizedProps.value.setBbox(viewport);
        reported = true;
      }
      if (node.memoizedProps?.weatherColorFn && node._debugHookTypes) {
        if (!reported) return { error: 'MicroclimateContext provider not found before VenueMap' };
        const types = node._debugHookTypes.filter(type => type !== 'useContext');
        const hooks = [];
        for (let hook = node.memoizedState; hook; hook = hook.next) hooks.push(hook);
        const states = hooks.filter((_, index) => types[index] === 'useState');
        // VenueMap's 7th–9th useState: areaPrompt, mapLoaded, mapError.
        const [areaPrompt, mapLoaded, mapError] = states.slice(6, 9);
        if (areaPrompt?.memoizedState !== null || mapLoaded?.memoizedState !== false || mapError?.memoizedState !== true) {
          return { error: 'VenueMap state order changed', values: states.slice(6, 9).map(hook => hook?.memoizedState) };
        }
        mapLoaded.queue.dispatch(true);
        mapError.queue.dispatch(false);
        areaPrompt.queue.dispatch({ minLng: 144.93, minLat: -37.84, maxLng: 145.0, maxLat: -37.79 });
        return { ok: true };
      }
      if (node.child) pending.push(node.child);
      if (node.sibling) pending.push(node.sibling);
    }
    return { error: 'VenueMap fiber not found' };
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  await page.getByRole('button', { name: 'Search this area', exact: true }).waitFor();
  await page.waitForTimeout(300);
}

const measure = page => page.evaluate(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const one = selector => rect(document.querySelector(selector));
  const visible = el => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  /** True when both rounded ends, top, bottom and centre of `el` hit-test to `el` itself. */
  const uncovered = el => {
    if (!el || !visible(el)) return false;
    const r = el.getBoundingClientRect();
    const midX = r.left + r.width / 2, midY = r.top + r.height / 2, end = Math.min(r.height / 2, r.width / 2);
    const points = [[r.left + end, midY], [r.right - end, midY], [midX, r.top + 2], [midX, r.bottom - 2], [midX, midY]];
    return points.every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
  };
  const input = document.querySelector('.ss-map-first-search-pill input');
  const searchArea = document.querySelector('.ss-map-search-area button');
  const caption = document.querySelector('.ss-map-caption-inner');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    chipRow: one('.ss-home-chip-row'),
    sheet: one('.ss-mobile-sheet'),
    searchFieldsVisible: [...document.querySelectorAll('input[aria-label="Search venues"]')].filter(visible).length,
    topSearch: { visible: visible(input), placeholder: input.placeholder, value: input.value },
    disclaimersVisible: [...document.querySelectorAll('.ss-discovery-source')].filter(visible)
      .filter(el => el.textContent.includes('Sun exposure is modelled')).length,
    sheetHeader: document.querySelector('.ss-mobile-sheet-head') ? {
      venuesHeading: uncovered(document.querySelector('#mobile-discovery-results')),
      resultCount: uncovered(document.querySelector('.ss-mobile-sheet-head > p')),
      sunniestFirst: uncovered(document.querySelector('.ss-explore-sort')),
    } : null,
    weatherChip: { text: document.querySelector('.ss-map-first-weather')?.textContent.trim(),
      icon: document.querySelector('.ss-map-first-weather img')?.getAttribute('src')?.match(/clay\/([a-z-]+)|([a-z-]+)-[\w-]{8}\.webp/)?.slice(1).find(Boolean) },
    searchArea: searchArea && visible(searchArea) ? { rect: rect(searchArea), pillHeight: rect(searchArea).height - 14,
      centreOffset: rect(searchArea).left + rect(searchArea).width / 2 - innerWidth / 2, uncovered: uncovered(searchArea) } : null,
    caption: caption && visible(caption) ? { rect: rect(caption), text: caption.innerText.replace(/\s+/g, ' ').trim(), locate: one('#locate-me') } : null,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  };
});

for (const width of [390, 320]) {
  const { page, context, errors } = await boot(width);
  await shot(page, `default-${width}`);
  const peek = await measure(page);
  await expandSheet(page, width);
  await shot(page, `sheet-expanded-${width}`);
  const expanded = await measure(page);
  // Weather details open from the top bar while the list is expanded.
  await page.locator('.ss-map-first-weather').click();
  const details = await page.evaluate(() => {
    const el = document.querySelector('.ss-map-first-weather-details .ss-explore-weather-detail');
    const r = el?.getBoundingClientRect();
    return r ? { top: r.top, uncovered: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) } : null;
  });
  await context.close();
  observations.push({ width, state: 'clear', peek, expanded, weatherDetailsOverList: details, errors });
}

for (const width of [390, 320]) {
  const { page, context, errors } = await boot(width);
  await mountOverlayFixture(page);
  await shot(page, `search-this-area-${width}`);
  const moved = await measure(page);
  await expandSheet(page, width);
  await shot(page, `search-this-area-then-list-${width}`);
  const movedThenList = await measure(page);
  await context.close();
  observations.push({ width, state: 'overlay fixture', moved, movedThenList, errors });
}

for (const sky of ['foggy', 'rainy']) {
  for (const width of [390, 320]) {
    const { page, context, errors } = await boot(width, { sky, scale: 2 });
    await shot(page, `weather-${sky}-${width}`, { clip: { x: 0, y: 0, width, height: 200 } });
    observations.push({ width, state: sky, chip: (await measure(page)).weatherChip, errors });
    await context.close();
  }
}

await browser.close();
await server.close();
await fs.writeFile(`${out}/observations.json`, `${JSON.stringify(observations, null, 2)}\n`);
console.log(JSON.stringify(observations, null, 2));
