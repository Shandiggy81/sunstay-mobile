// Browser-only fixture checks. All external requests are fulfilled or blocked.
// Run from the repository root: node docs/screenshots/after-dark-volt-pink/capture.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { weather as rawWeather } from '../../../e2e/fixtures/weather.js';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from '../../../e2e/fixtures/supabase.js';

const output = 'docs/screenshots/after-dark-volt-pink';
const port = Number(process.argv[2] || 5212);
const baseURL = `http://127.0.0.1:${port}`;
const NOW = new Date('2026-10-25T06:30:00Z'); // Sunday, 5:30pm Melbourne.
const weather = JSON.parse(JSON.stringify(rawWeather).replaceAll('2026-10-19', '2026-10-25').replaceAll('2026-10-20', '2026-10-26'));
Object.assign(weather.current, { time: '2026-10-25T17:30', temperature_2m: 14, apparent_temperature: 12,
  precipitation: 1.2, weather_code: 61, is_day: 1, wind_speed_10m: 18 });
for (const [key, value] of Object.entries({ temperature_2m: 14, apparent_temperature: 12,
  precipitation_probability: 70, precipitation: 1.2, weather_code: 61, wind_speed_10m: 18 })) weather.hourly[key].fill(value);

const event = ({ id, title, hour, category, price, free = false, venueName = '170 Russell', lat = -37.8145, lng = 144.9685 }) => ({
  id, name: title, url: `https://www.ticketmaster.com.au/event/${id}`,
  dates: { timezone: 'Australia/Melbourne', start: { dateTime: `2026-10-25T${String(hour - 11).padStart(2, '0')}:00:00Z` }, status: { code: 'onsale' } },
  classifications: [{ primary: true, segment: { name: category === 'live-music' ? 'Music' : 'Arts & Theatre' },
    genre: { name: category === 'comedy' ? 'Comedy' : category === 'family' ? "Children's Theatre" : 'Theatre' } }],
  ...(price == null ? {} : { priceRanges: [{ currency: 'AUD', min: price, max: free ? 0 : price + 10 }] }),
  _embedded: { venues: [{ name: venueName, location: { latitude: String(lat), longitude: String(lng) } }] },
});
const fetchedAt = NOW.toISOString();
const response = { fetchedAt, _embedded: { events: [
  event({ id: 'fixture-volt-music', title: 'NOISEMAKERS AUSTRALIAN TOUR ~ MELBOURNE EDITION (18+ Event)', hour: 18, category: 'live-music', price: 45 }),
  event({ id: 'fixture-volt-music-duplicate', title: 'NOISEMAKERS AUSTRALIAN TOUR ~ MELBOURNE EDITION (18+ Event)', hour: 18, category: 'live-music', price: 45 }),
  event({ id: 'fixture-volt-comedy', title: 'The Sunday comedy club', hour: 19, category: 'comedy', venueName: 'City Comedy Room' }),
  event({ id: 'fixture-volt-theatre', title: 'After the curtain', hour: 20, category: 'theatre', price: 30, venueName: 'Melbourne Theatre Room' }),
  event({ id: 'fixture-volt-family', title: 'Family night show', hour: 21, category: 'family', price: 0, free: true, venueName: 'City Family Stage' }),
] } };
// Fictional facts used only to prove the wet-show indoor-pairing rule.
const venues = [
  { id: 'fixture-outdoor', venueName: 'Open Air Bar', typeCategory: 'Pub', lat: -37.8145, lng: 144.9685,
    tags: ['Heaters', 'Beer Garden'], heating: 'outdoor heaters', sunshineScore: 70, opening_hours: 'Daily 4pm–11pm' },
  { id: 'fixture-indoor', venueName: 'The Lantern', typeCategory: 'Pub', lat: -37.8148, lng: 144.9685,
    tags: ['Fireplace', 'Indoor Warmth'], heating: 'fireplace', sunshineScore: 60, opening_hours: 'Daily 4pm–11pm' },
];
const observations = [];
process.env.VITE_MAPBOX_TOKEN = '';
process.env.VITE_SUPABASE_URL = FAKE_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = FAKE_SUPABASE_ANON_KEY;
process.env.VITE_OPENAQ_API_KEY = '';
const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', open: false },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium' });
await fs.mkdir(output, { recursive: true });

const modes = page => page.getByRole('group', { name: 'Home sheet mode', exact: true }).filter({ visible: true });
const panel = page => page.getByRole('region', { name: "Tonight's events", exact: true });

async function boot(width, height, kind = 'events', { desktop = false, mode = 'sun' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: !desktop, hasTouch: !desktop,
    timezoneId: 'Australia/Melbourne', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(NOW);
  await context.routeWebSocket('**', socket => socket.close());
  await page.addInitScript(mode => {
    sessionStorage.setItem('splashShown', 'true');
    sessionStorage.setItem('ss-sunny-advice-shown', '1');
    sessionStorage.setItem('ss-home-sheet-mode', mode);
    navigator.geolocation.getCurrentPosition = (_success, fail) => {
      window.__fixtureLocationCalls = (window.__fixtureLocationCalls ?? 0) + 1;
      fail({ code: 1, message: 'Fixture: location denied' });
    };
  }, mode);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === baseURL) return route.continue();
    if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: weather });
    if (url.origin === 'https://www.ticketmaster.com.au') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Ticket fixture</title>' });
    if (url.origin === FAKE_SUPABASE_URL) {
      if (url.pathname === '/functions/v1/weather') return route.fulfill({ json: weather });
      if (url.pathname === '/functions/v1/events-tonight') {
        requests.push({ lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')), radius: url.searchParams.get('radius') });
        return route.fulfill({ json: kind === 'empty' ? { fetchedAt, _embedded: { events: [] } } : response });
      }
      if (url.pathname === '/rest/v1/venues') return route.fulfill({ json: venues });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto(baseURL);
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
  await expect(page.locator('.ss-map-first-weather')).toContainText('14°');
  return { page, context, errors, requests };
}

async function openAfterDark(page) {
  await modes(page).getByRole('button', { name: 'After Dark', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.waitForTimeout(350);
}

async function measurements(page) {
  return page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].filter(node => node.checkVisibility({ visibilityProperty: true }));
    const first = document.querySelector('.ss-after-dark-event');
    return {
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      panelOverflow: visible('.ss-after-dark-panel, .ss-after-dark-event').some(node => node.scrollWidth > node.clientWidth),
      flatIcons: visible('.ss-after-dark-panel svg').length,
      smallControls: visible('.ss-after-dark-panel button, .ss-after-dark-panel a, [aria-label="Home sheet mode"] button')
        // Translated sheet rects can report 43.999984px for a 44px CSS box.
        .filter(node => { const box = node.getBoundingClientRect(); return box.width < 43.99 || box.height < 43.99; })
        .map(node => { const box = node.getBoundingClientRect(); return { text: node.textContent.trim(), width: box.width, height: box.height }; }),
      firstShowTop: first ? Math.round(first.getBoundingClientRect().top) : null,
      firstTitleTop: first ? Math.round(first.querySelector('h4').getBoundingClientRect().top) : null,
      origin: document.querySelector('.ss-after-dark-origin')?.textContent,
      panelBackground: getComputedStyle(document.querySelector('.ss-after-dark-panel')).backgroundColor,
    };
  });
}

async function contrastPairs(page, selector = '.ss-after-dark-panel') {
  return page.locator(selector).evaluate(root => {
    const rgba = value => (value.match(/[\d.]+/g) ?? []).map(Number);
    const hex = values => '#' + values.slice(0, 3).map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase();
    const luminance = values => values.slice(0, 3).map(value => value / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const pairs = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode, element = text.parentElement;
      if (!text.textContent.trim() || element.closest('.sr-only') || !element.checkVisibility({ visibilityProperty: true })) continue;
      const foreground = rgba(getComputedStyle(element).color);
      let ancestor = element, background;
      while (ancestor) {
        const candidate = rgba(getComputedStyle(ancestor).backgroundColor);
        if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
        ancestor = ancestor.parentElement;
      }
      if (!background) background = [255, 255, 255];
      const light = luminance(foreground), dark = luminance(background);
      const ratio = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
      const pair = { foreground: hex(foreground), background: hex(background), ratio: Number(ratio.toFixed(2)) };
      const key = `${pair.foreground}/${pair.background}`;
      if (!pairs.has(key)) pairs.set(key, { ...pair, sample: text.textContent.trim().slice(0, 70) });
    }
    return [...pairs.values()];
  });
}

try {
  for (const [width, height] of [[390, 844], [320, 568]]) {
    for (const kind of ['events', 'empty']) {
      const { page, context, errors, requests } = await boot(width, height, kind);
      try {
        assert.equal(requests.length, 0, 'Sun peek does not fetch events.');
        await openAfterDark(page);
        await expect(panel(page).getByRole('heading', { name: 'Tonight nearby', exact: true })).toBeVisible();
        await expect(panel(page)).toContainText('Sunday night');
        await expect(panel(page).getByRole('button', { name: 'Near me', exact: true })).toBeVisible();
        await expect(panel(page)).toContainText('Walk times from Flinders St Station');
        if (kind === 'events') {
          await expect(panel(page).getByRole('article')).toHaveCount(4); // Five raw records include the same show twice.
          const first = panel(page).getByRole('article').first();
          await expect(first).toContainText('Noisemakers Australian Tour, Melbourne Edition');
          await expect(first).toContainText('18+');
          await expect(first).toContainText('From $45');
          await expect(first).toContainText('Warm and dry before the show: The Lantern');
          await expect(first).not.toContainText('Open Air Bar');
          const tickets = first.getByRole('link', { name: 'Tickets on Ticketmaster', exact: true });
          await expect(tickets).toHaveAttribute('target', '_blank');
          await expect(tickets).toHaveAttribute('rel', 'noopener noreferrer');
        } else {
          await expect(panel(page)).toContainText('No shows listed near here tonight.');
          await expect(panel(page).getByRole('button', { name: 'Cosy spots', exact: true })).toBeInViewport({ ratio: 1 });
        }
        const measured = await measurements(page);
        assert.equal(measured.horizontalOverflow, false);
        assert.equal(measured.panelOverflow, false);
        assert.equal(measured.flatIcons, 0);
        assert.deepEqual(measured.smallControls, []);
        if (kind === 'events' && width === 390) assert.ok(measured.firstShowTop < height / 2, 'First show starts in the top half.');
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${output}/${kind}-${width}.png` });
        const contrast = await contrastPairs(page, '.ss-mobile-sheet--after-dark');
        assert.ok(contrast.every(pair => pair.ratio >= 4.5), JSON.stringify(contrast.filter(pair => pair.ratio < 4.5)));
        observations.push({ width, height, kind, requests, measured, contrast, errors });
        if (kind === 'events') {
          if (width === 320) {
            await panel(page).getByRole('article').first().getByRole('link', { name: 'Tickets on Ticketmaster', exact: true }).scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            await page.screenshot({ path: `${output}/event-details-320.png` });
          }
          await panel(page).getByRole('button', { name: 'Comedy', exact: true }).tap();
          await expect(panel(page).getByRole('article')).toHaveCount(1);
          await expect(panel(page).getByRole('article')).toContainText('The Sunday comedy club');
          await panel(page).getByRole('button', { name: 'All', exact: true }).tap();
          await panel(page).getByRole('button', { name: 'Free', exact: true }).tap();
          await expect(panel(page).getByRole('article')).toHaveCount(1);
          await expect(panel(page).getByRole('article')).toContainText('Family night show');
          assert.equal(requests.length, 1, 'Filters remain local.');
          await panel(page).getByRole('button', { name: 'Free', exact: true }).tap();
          const focusTarget = panel(page).getByRole('button', { name: 'All', exact: true });
          await page.keyboard.press('Tab'); // Enter keyboard modality before checking :focus-visible.
          await focusTarget.focus();
          const focus = await focusTarget.evaluate(node => ({ width: getComputedStyle(node).outlineWidth, style: getComputedStyle(node).outlineStyle }));
          assert.notEqual(focus.style, 'none');
          assert.ok(parseFloat(focus.width) >= 2);
          observations.push({ width, kind: 'filters-focus', focus });
          await panel(page).getByRole('button', { name: 'Near me', exact: true }).tap();
          await expect(panel(page).locator('.ss-after-dark-origin')).toHaveText('Location off · showing Melbourne');
          assert.equal(await page.evaluate(() => window.__fixtureLocationCalls), 1);
          observations.push({ width, kind: 'near-me-denied', hint: await panel(page).locator('.ss-after-dark-origin').innerText() });
          const tickets = panel(page).getByRole('article').first().getByRole('link', { name: 'Tickets on Ticketmaster', exact: true });
          await page.keyboard.press('Tab');
          await tickets.focus();
          const [popup] = await Promise.all([page.waitForEvent('popup'), tickets.press('Enter')]);
          await popup.waitForLoadState('domcontentloaded');
          await expect(popup).toHaveURL('https://www.ticketmaster.com.au/event/fixture-volt-music');
          await popup.close();
          observations.push({ width, kind: 'tickets-keyboard', newTab: true, intercepted: true });
        } else {
          await panel(page).getByRole('button', { name: 'Cosy spots', exact: true }).tap();
          await expect(modes(page).getByRole('button', { name: 'Sun', exact: true })).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('.ss-home-moments button').filter({ hasText: 'Cozy spots' })).toHaveAttribute('aria-pressed', 'true');
          observations.push({ width, kind: 'empty-cosy', mode: 'sun', cosyFilter: true });
        }
      } finally { await context.close(); }
    }
  }
  // The dark peek is scoped to After Dark; selecting Sun restores warm surfaces.
  {
    const { page, context, errors, requests } = await boot(390, 844, 'events', { mode: 'after-dark' });
    try {
      assert.equal(requests.length, 0, 'After Dark peek does not fetch until opened.');
      const peek = page.locator('.ss-home-sheet-peek');
      await page.screenshot({ path: `${output}/peek-390.png` });
      const darkPeek = await peek.evaluate(node => getComputedStyle(node).backgroundColor);
      const contrast = await contrastPairs(page, '.ss-home-sheet-peek');
      assert.ok(contrast.every(pair => pair.ratio >= 4.5), JSON.stringify(contrast.filter(pair => pair.ratio < 4.5)));
      await modes(page).getByRole('button', { name: 'Sun', exact: true }).click();
      const sunPeek = await peek.evaluate(node => getComputedStyle(node).backgroundColor);
      assert.equal(sunPeek, 'rgb(255, 255, 255)');
      assert.notEqual(darkPeek, sunPeek);
      await page.screenshot({ path: `${output}/sun-unchanged-390.png` });
      observations.push({ kind: 'peek-sun', darkPeek, sunPeek, contrast, errors });
    } finally { await context.close(); }
  }
  {
    const { page, context, errors, requests } = await boot(1280, 900, 'events', { desktop: true });
    try {
      await openAfterDark(page);
      await expect(panel(page).getByRole('article')).toHaveCount(4);
      const measured = await measurements(page);
      assert.equal(measured.horizontalOverflow, false);
      assert.equal(measured.panelOverflow, false);
      assert.deepEqual(measured.smallControls, []);
      assert.deepEqual(errors, []);
      const contrast = await contrastPairs(page, '.ss-sidebar--after-dark');
      assert.ok(contrast.every(pair => pair.ratio >= 4.5), JSON.stringify(contrast.filter(pair => pair.ratio < 4.5)));
      await page.screenshot({ path: `${output}/desktop-events-1280.png` });
      observations.push({ kind: 'desktop', width: 1280, height: 900, requests, measured, contrast, errors });
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
const contrast = [...new Map(observations.flatMap(row => row.contrast ?? [])
  .map(pair => [`${pair.foreground}/${pair.background}`, pair])).values()];
const cases = observations.map(({ contrast: _contrast, ...row }) => row);
const result = { contrast, cases };
await fs.writeFile(`${output}/observations.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
