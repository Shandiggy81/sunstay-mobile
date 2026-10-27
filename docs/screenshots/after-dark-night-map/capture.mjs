// Browser-only fixture checks. All external requests are fulfilled or blocked.
// Run from the repository root: node docs/screenshots/after-dark-night-map/capture.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { lightProbePlugin, checkLightContract } from './light-probe.mjs';
import { weather as rawWeather } from '../../../e2e/fixtures/weather.js';
import { FAKE_SUPABASE_URL, FAKE_SUPABASE_ANON_KEY } from '../../../e2e/fixtures/supabase.js';

const output = 'docs/screenshots/after-dark-night-map';
const port = Number(process.argv[2] || 5216);
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
const server = await createServer({ plugins: [lightProbePlugin], server: { port, strictPort: true, host: '127.0.0.1', open: false },
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

try {
  const {page, context, errors, requests} = await boot(390, 844);
  try {
    await expect(page.getByText('Map failed to load', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Lunch', exact: true}).click();
    await page.screenshot({path: `${output}/sun-before-390.png`});
    await openAfterDark(page);
    await expect(modes(page).getByRole('button', {name: 'After Dark', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({path: `${output}/after-dark-open-390.png`});
    await page.locator('.ss-mobile-sheet-backdrop').click({position: {x: 5, y: 120}});
    await expect(panel(page)).toBeHidden();
    await page.screenshot({path: `${output}/after-dark-map-390.png`});
    await modes(page).getByRole('button', {name: 'Sun', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Lunch', exact: true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button', {name: 'Fine-tune preview time', exact: true}).click();
    const slider = page.getByRole('slider', {name: 'Time of day for 3D building shadows', exact: true});
    await expect(slider).toHaveValue('720');
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('725');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('730');
    await expect(page.locator('.ss-map-time-popover output')).toHaveText('12:10 PM');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await expect(page.getByText('Map failed to load', {exact: true})).toBeVisible();
    assert.deepEqual(errors, []);
    await page.screenshot({path: `${output}/sun-return-slider-390.png`});
    observations.push({viewport: {width:390,height:844}, mapboxTokenAvailable:false,
      basemapVisualVerified:false, modeSequence:['sun','after-dark','sun'],
      selectedMinutesBefore:720, preservedMinutesAfter:720, sliderMinutesAfterKeyboard:730,
      displayedTime:'12:10 PM', eventsRequests:requests, horizontalOverflow:false, errors});
    observations.push(await checkLightContract(page, baseURL));
    assert.deepEqual(errors, []);
  } finally {await context.close();}
} finally {await browser.close();await server.close();}
await fs.writeFile(`${output}/observations.json`,JSON.stringify(observations,null,2)+'\n');
console.log(JSON.stringify(observations));
