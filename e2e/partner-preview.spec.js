import { test, expect } from '@playwright/test';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';
import { SHORT_STAY_FIXTURE } from './fixtures/shortStay.js';
import { demoVenues } from '../src/data/demoVenues.js';
import { weather as sunny } from './fixtures/weather.js';

// Monday 19 October 2026, Melbourne daylight time (UTC+11).
const melbourne = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 19, hour - 11, minute));
const SPECIAL = 'Mulled wine $12 from 5pm';

// Overcast, then rain from 6pm on the 19th.
const rainy = structuredClone(sunny);
Object.assign(rainy.current, { temperature_2m: 15, apparent_temperature: 13, cloud_cover: 90, weather_code: 3 });
rainy.hourly.time.forEach((time, i) => {
  const wet = time.startsWith('2026-10-19') && Number(time.slice(11, 13)) >= 18;
  rainy.hourly.temperature_2m[i] = 14;
  rainy.hourly.weather_code[i] = wet ? 63 : 3;
  rainy.hourly.cloud_cover[i] = wet ? 100 : 90;
  rainy.hourly.precipitation_probability[i] = wet ? 80 : 10;
  rainy.hourly.precipitation[i] = wet ? 1.4 : 0;
});

async function openPartnerPreview(page, baseURL, { venue, name, now, forecast, rows = null, venues = null }) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(now);
  await page.context().routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (forecast && url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') return route.fulfill({ json: forecast });
    // Venue readings (venues_in_bbox rows) only when a test supplies them.
    if (rows && url.origin === FAKE_SUPABASE_URL && url.pathname.endsWith('/rpc/venues_in_bbox')) return route.fulfill({ json: rows });
    // Venue rows only when a test supplies them (the demo list plus a short-stay home).
    if (venues && url.origin === FAKE_SUPABASE_URL && url.pathname.endsWith('/rest/v1/venues')) return route.fulfill({ json: venues });
    // Venues stay on the demo list; nothing else leaves the browser (no forecast when `forecast` is null).
    return route.abort('blockedbyclient');
  });
  await page.goto(`/?venue=${venue}`);
  const card = page.getByRole('article', { name, exact: true });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: new RegExp(`^Run ${name}\\?`) }).click();
  const panel = page.getByRole('dialog', { name });
  // Each partner type opens on its own heading: Today for a venue, Room sun for a hotel, Your home for a short stay.
  await expect(panel.getByRole('heading', { name: /^(Today|Room sun|Your home)$/ })).toBeVisible();
  return { errors, card, panel };
}

// The app's card and the preview's card are on the page together: every id once, and each
// card's labels, descriptions and controls resolve inside that same card.
async function expectOwnIds(page, name) {
  const audit = await page.evaluate(venueName => {
    const counts = {};
    for (const element of document.querySelectorAll('[id]')) counts[element.id] = (counts[element.id] ?? 0) + 1;
    const cards = [document.querySelector(`#root [role="dialog"][aria-label="${venueName} details"]`),
      document.querySelector(`[role="region"][aria-label="${venueName} guest card preview"]`)];
    const strays = [];
    let checked = 0;
    for (const card of cards) {
      if (!card) { strays.push('card not mounted'); continue; }
      for (const element of card.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls], label[for]')) {
        const ids = element.matches('label[for]') ? [element.htmlFor]
          : ['aria-labelledby', 'aria-describedby', 'aria-controls'].flatMap(name => (element.getAttribute(name) ?? '').split(/\s+/)).filter(Boolean);
        for (const id of ids) {
          checked += 1;
          if (!card.contains(document.getElementById(id))) strays.push(id);
        }
      }
    }
    return { duplicates: Object.keys(counts).filter(id => counts[id] > 1), strays, checked };
  }, name);
  expect(audit.duplicates).toEqual([]);
  expect(audit.strays).toEqual([]);
  expect(audit.checked).toBeGreaterThan(5);
}

async function expectTouchTargets(locator) {
  for (const box of await locator.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

test('sunny lunch: next service, a special, and the real guest card one tap away at 390×844', async ({ page, baseURL }) => {
  const { errors, card, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: sunny });
  const service = panel.getByRole('article', { name: 'Open now · until 5pm' });
  await expect(service).toContainText('8am–5pm');
  await expect(service).toContainText('Sunny, 23°');
  await expect(service).toContainText('Hours from your listing');
  await expectTouchTargets(panel.locator('.ss-partner-todo button, .ss-partner-viewbar button'));

  // Edit a special: it saves on this device as it's typed, no Save button.
  await panel.getByRole('button', { name: /^Add a special/ }).click();
  await expect(panel.getByLabel('What’s on special?')).toBeFocused();
  await panel.getByLabel('What’s on special?').fill(SPECIAL);
  await expect(panel.getByText('Saved on this device · Preview only')).toBeVisible();

  // One tap to the guest card itself, scrolled to the special.
  const viewSwitch = panel.getByRole('group', { name: 'Partner preview view' });
  await viewSwitch.getByRole('button', { name: 'Guest view' }).tap();
  const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
  await expect(guest).toBeVisible();
  // The jump lands on the preview's own Specials, labelled by its own heading.
  const specials = guest.getByRole('region', { name: 'Specials', exact: true });
  await expect(specials).toContainText(SPECIAL);
  await expect(specials).toContainText('From the partner preview on this device');
  await expect(specials).toBeInViewport();
  await expect(panel.getByLabel('What’s on special?')).toBeHidden();
  await expectOwnIds(page, 'Mr Tulk');
  // With the weather detail open in both cards, each toggle still points at its own panel.
  await page.getByRole('dialog', { name: 'Mr Tulk details' }).getByRole('button', { name: 'UV, air quality and wind comfort' }).evaluate(button => button.click());
  await guest.getByRole('button', { name: 'UV, air quality and wind comfort' }).click();
  await expectOwnIds(page, 'Mr Tulk');

  // Back to editing: the draft and the place in the editor are kept.
  await viewSwitch.getByRole('button', { name: 'Edit' }).tap();
  await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);
  await expect(panel.getByRole('button', { name: /^Special added/ })).toContainText(`“${SPECIAL}”`);

  // The heating answer reaches the same guest card.
  await panel.getByRole('radio', { name: /No, our heating is indoors only/ }).check();
  await viewSwitch.getByRole('button', { name: 'Guest view' }).tap();
  // The card names a warm indoor space twice (a chip up top and Good to know).
  await expect(guest.getByText('Outdoor heaters', { exact: true })).toHaveCount(0);
  await expect(guest.locator('.ss-venue-fact').filter({ hasText: /^Warm indoor space$/ })).toHaveCount(1);
  await expect(panel.getByText('Off your card in this preview:')).toBeVisible();

  // Closing keeps it all on this device; guests' card underneath still shows the listing.
  await panel.getByRole('button', { name: 'Close partner preview' }).click();
  await expect(card.locator('.ss-venue-fact').filter({ hasText: /^Outdoor heaters$/ })).toHaveCount(1);
  await card.getByRole('button', { name: /^Run Mr Tulk\?/ }).click();
  await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);
  await expect(panel.getByRole('radio', { name: /No, our heating is indoors only/ })).toBeChecked();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('rainy evening: the next service warns about rain before opening', async ({ page, baseURL }) => {
  const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-25', name: 'La La Land Windsor', now: melbourne(16, 10), forecast: rainy });
  const service = panel.getByRole('article', { name: 'Opens 5pm tonight' });
  await expect(service).toContainText('5pm–1am');
  await expect(service).toContainText('Rain likely from 6pm');
  await expect(service).toContainText('80% chance · 14°');
  await expect(service).toContainText('Plan for wet arrivals');
  expect(errors).toEqual([]);
});

test('missing data: no forecast and unreadable hours are asked for, not guessed', async ({ page, baseURL }) => {
  const tulk = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: null });
  await expect(tulk.panel.getByRole('article', { name: 'Open now · until 5pm' })).toContainText('Forecast unavailable right now');
  await expect(tulk.panel.getByText('We won’t guess the weather for this service.')).toBeVisible();
  await tulk.panel.getByRole('button', { name: 'Close partner preview' }).click();

  await page.goto('/?venue=dv-22');
  const card = page.getByRole('article', { name: 'Arbory Afloat', exact: true });
  await card.getByRole('button', { name: /^Run Arbory Afloat\?/ }).click();
  const panel = page.getByRole('dialog', { name: 'Arbory Afloat' });
  await expect(panel.getByRole('article', { name: 'Hours not set' })).toContainText('Add your service hours');
  await panel.getByRole('button', { name: /^Add your service hours/ }).click();
  await expect(panel.getByRole('button', { name: 'Hide service hours' })).toBeVisible();
  expect(tulk.errors).toEqual([]);
});

test('phone switch: the keyboard reaches both views and focus comes back where it left', async ({ page, baseURL }) => {
  const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: sunny });
  const viewSwitch = panel.getByRole('group', { name: 'Partner preview view' });
  const editButton = viewSwitch.getByRole('button', { name: 'Edit' });
  const guestButton = viewSwitch.getByRole('button', { name: 'Guest view' });
  const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
  await expect(panel.getByRole('button', { name: 'Close partner preview' })).toBeFocused();
  await panel.getByLabel('What’s on special?').fill(SPECIAL);
  await panel.getByRole('button', { name: 'Close partner preview' }).focus();

  // The switch closes the panel's tab loop: Shift+Tab from Close lands on it, Enter and Space work it.
  await page.keyboard.press('Shift+Tab');
  await expect(guestButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(guestButton).toHaveAttribute('aria-pressed', 'true');
  await expect(guest).toBeVisible();
  await expect(guestButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editButton).toBeFocused();
  await page.keyboard.press('Space');
  await expect(editButton).toHaveAttribute('aria-pressed', 'true');
  await expect(editButton).toBeFocused();
  await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);

  // A to-do row hides as it opens the guest view, so focus goes to the guest view's heading,
  // Tab carries on into the card, and the card's own close comes back to that row.
  const row = panel.getByRole('button', { name: /^(Check your guest card|Guest card checked)/ });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(guest).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Guest view', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(guest.locator(':focus')).toHaveCount(1);
  await guest.getByRole('button', { name: 'Close venue details' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(editButton).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toBeFocused();
  await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);
  expect(errors).toEqual([]);
});

for (const reading of [
  { status: 'expired', computedMinutesAgo: 95, expiresMinutesAgo: 65, line: 'Venue reading expired at 11:10am · left off your guest card until it refreshes' },
  { status: 'fresh', computedMinutesAgo: 10, expiresMinutesAgo: null, line: 'Venue reading · on your guest card' },
]) {
  test(`${reading.status === 'expired' ? 'an' : 'a'} ${reading.status} venue reading next to a fresh forecast: each gets its own status`, async ({ page, baseURL }) => {
    const now = melbourne(12, 15);
    const row = { id: 'dv-20', sun_now: 0.92, effective_sun: 0.92, geometry_confidence: 0.8,
      weather_computed_at: new Date(now - reading.computedMinutesAgo * 60000).toISOString(),
      ...(reading.expiresMinutesAgo == null ? {} : { expires_at: new Date(now - reading.expiresMinutesAgo * 60000).toISOString() }) };
    const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now, forecast: sunny, rows: [row] });
    const service = panel.getByRole('article', { name: 'Open now · until 5pm' });
    await expect(service.getByRole('img', { name: 'Forecast, Updated just now, Source Open-Meteo' })).toBeVisible();
    await expect(service).toContainText(reading.line);
    await expect(service.getByRole('img', { name: 'Calculated, Updated 10 minutes ago, Source SunStay venue reading' }))
      .toHaveCount(reading.status === 'fresh' ? 1 : 0);

    // The guest card shows the reading only while it's fresh, so an expired one is never called live.
    await panel.getByRole('group', { name: 'Partner preview view' }).getByRole('button', { name: 'Guest view' }).tap();
    const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
    await guest.getByRole('button', { name: 'UV, air quality and wind comfort' }).click();
    const details = guest.locator('.ss-venue-weather-details');
    await expect(details).toBeVisible();
    if (reading.status === 'fresh') await expect(details).toContainText(/Microclimate at .*Live/);
    else {
      await expect(details).not.toContainText('Microclimate at');
      await expect(details).not.toContainText(/\bLive\b/);
    }
    expect(errors).toEqual([]);
  });
}

// Short phones: the guest card shrinks and scrolls in its frame, and the bar under it stays clear.
for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }]) {
  test.describe(`short phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('guest view leaves the Edit | Guest view bar uncovered and tappable', async ({ page, baseURL }) => {
      const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: sunny });
      await panel.getByLabel('What’s on special?').fill(SPECIAL);
      const viewSwitch = panel.getByRole('group', { name: 'Partner preview view' });
      await viewSwitch.getByRole('button', { name: 'Guest view' }).tap();
      const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
      // The jump to Specials lands inside the shorter frame, and the frame ends where the bar starts.
      await expect(guest.getByRole('region', { name: 'Specials', exact: true })).toBeInViewport();
      const frameBottom = await panel.locator('.ss-partner-guest-frame').evaluate(frame => frame.getBoundingClientRect().bottom);
      expect(frameBottom).toBeLessThanOrEqual(await viewSwitch.evaluate(bar => bar.getBoundingClientRect().top));

      // Nothing sits over either button, at its centre or 4px below its top edge.
      for (const name of ['Edit', 'Guest view']) {
        const hits = await viewSwitch.getByRole('button', { name }).evaluate(button => {
          const { left, top, width, height } = button.getBoundingClientRect();
          return [top + height / 2, top + 4].map(y => document.elementFromPoint(left + width / 2, y)?.closest('button') === button);
        });
        expect(hits, `${name}: centre, 4px below the top`).toEqual([true, true]);
      }

      await viewSwitch.getByRole('button', { name: 'Edit' }).tap();
      await expect(guest).toBeHidden();
      await expect(panel.getByLabel('What’s on special?')).toHaveValue(SPECIAL);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('wide window', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('the guest card sits beside the editor and shows the special as it saves', async ({ page, baseURL }) => {
    const { errors, panel } = await openPartnerPreview(page, baseURL, { venue: 'dv-20', name: 'Mr Tulk', now: melbourne(12, 15), forecast: sunny });
    const guest = panel.getByRole('region', { name: 'Mr Tulk guest card preview' });
    await expect(guest).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Partner preview view' })).toBeHidden();
    await panel.getByLabel('What’s on special?').fill(SPECIAL);
    const specials = guest.getByRole('region', { name: 'Specials', exact: true });
    await expect(specials).toContainText(SPECIAL);
    await expect(specials).toBeInViewport();
    await expectOwnIds(page, 'Mr Tulk');
    expect(errors).toEqual([]);
  });
});

// One first screen per partner type, from the existing classification, each with one owner task done.
test.describe('partner types', () => {
  const open = async (page, baseURL, venue, name) => {
    const opened = await openPartnerPreview(page, baseURL, { venue, name, now: melbourne(12, 15), forecast: sunny, venues: [...demoVenues, SHORT_STAY_FIXTURE] });
    return { ...opened, panel: page.getByRole('dialog', { name, exact: true }) };
  };

  test('hotel: two room types compared on a date, the shared pool kept apart', async ({ page, baseURL }) => {
    const { errors, panel } = await open(page, baseURL, 'dv-17', 'Lancemore Crossley St');
    await expect(panel.getByRole('heading', { name: 'Room sun', exact: true })).toBeVisible();
    await expect(panel.getByRole('article', { name: /^Next service|^Open now|^Opens|^Hours not set/ })).toHaveCount(0);
    // It starts from the sunniest and shadiest sides on today's date, unnamed, and says what isn't known.
    const compare = panel.getByRole('article', { name: 'Room type A gets 4h 49m more sun on Mon 19 Oct' });
    await expect(compare).toContainText('North side · Level 5');
    await expect(compare).toContainText('Room name not set · A and B');
    await expect(compare).toContainText('Sun modelled at Level 5 only · A and B');
    await expect(panel.getByRole('region', { name: 'Shared pool' })).toContainText('Not recorded. Guests aren’t told about a pool.');
    // A lobby bar in the listing keeps specials and events; outdoor furniture and service hours are a venue's.
    await expect(panel.getByText('Your listing mentions a lobby bar, so specials and events stay here.')).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Tonight & events' })).toHaveCount(1);
    await expect(panel.getByRole('heading', { name: 'Outdoor setup' })).toHaveCount(0);
    await expect(panel.getByRole('heading', { name: 'Service hours' })).toHaveCount(0);

    await panel.getByLabel('Date to check').fill('2026-11-21');
    await panel.getByRole('button', { name: /^Name the two room types/ }).click();
    await expect(panel.getByLabel('Room name').first()).toBeFocused();
    const rooms = panel.locator('.ss-partner-room-fields');
    // Typed key by key, as a manager would: the space between words must survive each save.
    await rooms.nth(0).getByLabel('Room name').pressSequentially('King room');
    await expect(rooms.nth(0).getByLabel('Room name')).toHaveValue('King room');
    await rooms.nth(0).getByLabel('Side of the building').selectOption('dv-17-facade-0');
    await rooms.nth(0).getByRole('button', { name: 'Balcony', exact: true }).click();
    await rooms.nth(1).getByLabel('Room name').fill('Twin room');
    await rooms.nth(1).getByLabel('Side of the building').selectOption('dv-17-facade-2');
    await rooms.nth(1).getByRole('button', { name: 'Window only' }).click();
    await expectTouchTargets(panel.locator('.ss-partner-room-fields button, .ss-partner-room-fields input, .ss-partner-room-fields select, .ss-partner-stay-date input'));
    const done = panel.getByRole('article', { name: 'King room gets 1h 41m more sun on Sat 21 Nov' });
    await expect(done).toContainText('3h 43m');
    await expect(done).toContainText('Balcony roof not modelled · A');
    await expect(panel.getByRole('button', { name: /^Room types compared/ })).toHaveAttribute('data-done', 'true');
    await panel.getByRole('region', { name: 'Shared pool' }).getByRole('button', { name: 'Rooftop pool' }).click();
    await expect(panel.getByRole('region', { name: 'Shared pool' })).toContainText('Up to 14h 10m of sun on Sat 21 Nov under open sky');
    await expect(panel.getByRole('region', { name: 'Shared pool' })).toContainText('Nearby towers not modelled');

    // The guest card now shows the two room types for that date, still marked modelled.
    await panel.getByRole('group', { name: 'Partner preview view' }).getByRole('button', { name: 'Guest view' }).tap();
    const guest = panel.getByRole('region', { name: 'Lancemore Crossley St guest card preview' });
    const stay = guest.getByRole('region', { name: 'Balcony and window sun' });
    await expect(stay).toContainText('Modelled · Hotel-confirmed (next) · On-site checked (not yet)');
    await expect(stay).toContainText('King room');
    await expect(stay).toContainText('Twin room');
    await expect(stay).toContainText('Sat 21 Nov');
    await expectOwnIds(page, 'Lancemore Crossley St');

    // Closing and reopening keeps the answers on this device.
    await panel.getByRole('button', { name: 'Close partner preview' }).click();
    await page.getByRole('article', { name: 'Lancemore Crossley St', exact: true }).getByRole('button', { name: /^Run Lancemore Crossley St\?/ }).click();
    await expect(panel.getByRole('article', { name: 'King room gets 1h 41m more sun on Sat 21 Nov' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('short stay: one home, its private balcony’s sun, and a garden the host places', async ({ page, baseURL }) => {
    const { errors, panel } = await open(page, baseURL, SHORT_STAY_FIXTURE.id, SHORT_STAY_FIXTURE.venueName);
    await expect(panel.getByRole('heading', { name: 'Your home', exact: true })).toBeVisible();
    const balcony = panel.getByRole('article', { name: 'Private balcony · 6h 28m of sun' });
    await expect(balcony).toContainText('North-west side · Level 1');
    await expect(panel.locator('.ss-partner-stay .ss-partner-unknowns')).toContainText('Whether the garden is private or shared');
    // A home doesn't have specials, events, service hours or outdoor furniture to manage.
    for (const heading of ['Special', 'Tonight & events', 'Service hours', 'Outdoor setup']) {
      await expect(panel.getByRole('heading', { name: heading, exact: true })).toHaveCount(0);
    }
    await panel.getByRole('button', { name: /^Who can use the garden\?/ }).click();
    await expect(panel.getByRole('button', { name: 'Only these guests' })).toBeFocused();
    await panel.getByRole('button', { name: 'Shared with other residents' }).click();
    await expect(panel.getByRole('article', { name: 'Other outdoor areas' })).toContainText('Shared garden');
    await expect(panel.getByRole('button', { name: /^Garden answered/ })).toHaveAttribute('data-done', 'true');
    await expectTouchTargets(panel.locator('.ss-partner-garden button, .ss-partner-stay-date input'));

    await panel.getByRole('group', { name: 'Partner preview view' }).getByRole('button', { name: 'Guest view' }).tap();
    const guest = panel.getByRole('region', { name: `${SHORT_STAY_FIXTURE.venueName} guest card preview` });
    await expect(guest.getByText('Shared garden', { exact: true })).toHaveCount(1);
    await expect(guest.getByText('Garden', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('pub: the listing’s bar hours are read, and what’s on is one tap from the first screen', async ({ page, baseURL }) => {
    const { errors, panel } = await open(page, baseURL, 'dv-18', 'The Corner Hotel');
    const service = panel.getByRole('article', { name: 'Opens 12pm tomorrow' });
    await expect(service).toContainText('12pm–late');
    await expect(service).toContainText('Rooftop bar hours from your listing');
    await expect(service).toContainText('What’s on Nothing added yet');
    await service.getByRole('button', { name: 'Add an event' }).click();
    await expect(panel.getByLabel('Event title')).toBeFocused();
    await panel.getByLabel('Event title').fill('Local bands');
    await panel.getByLabel('Event kind').selectOption('live-music');
    await panel.getByLabel('Event date').fill('2026-10-20');
    await panel.getByLabel('Event starts').fill('20:00');
    await panel.getByRole('button', { name: 'Add event' }).click();
    await expect(service).toContainText('What’s on Local bands · Tomorrow 8pm');
    await expect(panel.getByRole('button', { name: /^Event added/ })).toContainText('“Local bands” · Tomorrow 8pm');
    await panel.getByRole('group', { name: 'Partner preview view' }).getByRole('button', { name: 'Guest view' }).tap();
    await expect(panel.getByRole('region', { name: 'The Corner Hotel guest card preview' }).locator('.ss-venue-fact').filter({ hasText: 'Local bands' }))
      .toContainText('Tomorrow 8pm · Live music');
    expect(errors).toEqual([]);
  });

  test('café: the morning service and a café special; no what’s-on row', async ({ page, baseURL }) => {
    const { errors, panel } = await open(page, baseURL, 'dv-14', 'Industry Beans Fitzroy');
    await expect(panel.getByRole('article', { name: 'Open now · until 3:30pm' })).toContainText('7am–3:30pm');
    await expect(panel.locator('.ss-partner-service-on')).toHaveCount(0);
    const special = panel.getByLabel('What’s on special?');
    await expect(special).toHaveAttribute('placeholder', 'e.g. Coffee + pastry $9 before 10am');
    await special.fill('Flat white and a pastry $9 before 10am');
    await expect(panel.getByText('Saved on this device · Preview only')).toBeVisible();
    await panel.getByRole('group', { name: 'Partner preview view' }).getByRole('button', { name: 'Guest view' }).tap();
    await expect(panel.getByRole('region', { name: 'Industry Beans Fitzroy guest card preview' }).getByRole('region', { name: 'Specials', exact: true }))
      .toContainText('Flat white and a pastry $9 before 10am');
    expect(errors).toEqual([]);
  });
});
