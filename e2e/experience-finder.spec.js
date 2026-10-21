import { test, expect } from '@playwright/test';
import { weather, NOW } from './fixtures/weather.js';
import { FAKE_SUPABASE_URL } from './fixtures/supabase.js';

async function boot(page, baseURL, { unavailable = false, delayedVenues = false, venues = null } = {}) {
    const errors = [];
    let venueRequest;
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(NOW);
    await page.context().routeWebSocket('**', socket => socket.close());
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === baseURL) return route.continue();
        if (url.origin === 'https://api.open-meteo.com' && url.pathname === '/v1/forecast') {
            return unavailable ? route.fulfill({ status: 503, body: 'offline fixture' }) : route.fulfill({ json: weather });
        }
        if (url.origin === FAKE_SUPABASE_URL && delayedVenues && url.pathname.endsWith('/venues')) {
            venueRequest = route;
            return;
        }
        if (url.origin === FAKE_SUPABASE_URL && venues && url.pathname.endsWith('/venues')) return route.fulfill({ json: venues });
        return route.abort('blockedbyclient');
    });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Find your kind of day', exact: true })).toBeVisible();
    await expect(page.getByText(unavailable ? 'Live weather unavailable' : '23°', { exact: true }).first()).toBeVisible();
    return { errors, venueRequest: () => venueRequest };
}

const list = page => page.locator('.ss-mobile-sheet');
const rows = page => list(page).getByRole('button', { name: /^Venue: / });
const PROPERTY_FIXTURES = [
    { id: 'fixture-home', venueName: 'Fixture Home', typeCategory: 'Residential', typeLabel: 'Residential', lat: -37.81, lng: 144.96, tags: [] },
    { id: 'fixture-hotel', venueName: 'Fixture Hotel', typeCategory: 'Hotel', typeLabel: 'Hotel', lat: -37.81, lng: 144.96, tags: [] },
];

test('Homes explains missing inventory and lets the user browse again', async ({ page, baseURL }, testInfo) => {
    const { errors } = await boot(page, baseURL, { venues: [PROPERTY_FIXTURES[1]] });
    await expect(page.locator('.ss-mobile-sheet-handle .ss-discovery-source')).toContainText('Venue listings');
    await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
    await list(page).getByRole('button', { name: 'Homes', exact: true }).tap();
    await expect(list(page).getByRole('heading', { name: 'No homes in these listings', exact: true })).toBeVisible();
    await expect(list(page).getByRole('heading', { name: 'A bit too specific!', exact: true })).toHaveCount(0);
    const browse = list(page).getByRole('button', { name: 'Browse all venues', exact: true });
    const target = await browse.boundingBox();
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('homes-empty-390.png') });
    await browse.tap();
    await expect(rows(page)).toHaveCount(1);
    await expect(list(page).getByRole('button', { name: 'Homes', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
});

test('Homes remains visible when Stays is selected too, with matching list count', async ({ page, baseURL }, testInfo) => {
    const { errors } = await boot(page, baseURL, { venues: PROPERTY_FIXTURES });
    await expect(page.locator('.ss-mobile-sheet-handle .ss-discovery-source')).toContainText('Venue listings');
    await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
    await list(page).getByRole('button', { name: 'Homes', exact: true }).tap();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Fixture Home');
    await list(page).getByRole('button', { name: 'Stays', exact: true }).tap();
    await expect(list(page).locator('.ss-mobile-sheet-head')).toContainText('2 results');
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: 'Fixture Home' })).toBeVisible();
    await expect(rows(page).filter({ hasText: 'Fixture Home' }).getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0);
    await expect(rows(page).filter({ hasText: 'Fixture Hotel' }).getByRole('button', { name: 'Compare', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('homes-and-stays-390.png') });
    await list(page).getByRole('textbox', { name: 'Search venues', exact: true }).fill('zzzz-no-match');
    await list(page).getByRole('button', { name: 'Stays', exact: true }).tap();
    await expect(list(page).getByRole('heading', { name: 'No homes match this search', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});

test('Homes waits for listings before declaring missing inventory', async ({ page, baseURL }) => {
    const { errors, venueRequest } = await boot(page, baseURL, { delayedVenues: true });
    await page.getByRole('button', { name: 'Show venue list', exact: true }).click();
    await list(page).getByRole('button', { name: 'Homes', exact: true }).tap();
    await expect(list(page).getByRole('heading', { name: 'Checking for homes', exact: true })).toBeVisible();
    await expect.poll(venueRequest).toBeTruthy();
    await venueRequest().fulfill({ json: [PROPERTY_FIXTURES[0]] });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Fixture Home');
    expect(errors).toEqual([]);
});

test('experience shortcuts use the existing stay/date controls and comparisons', async ({ page, baseURL }) => {
    const { errors } = await boot(page, baseURL);
    await page.getByRole('button', { name: 'Sunny stays Compare sun potential', exact: true }).tap();
    await expect(list(page).getByRole('heading', { name: 'Venues', exact: true })).toBeVisible();
    await expect(list(page).getByRole('button', { name: 'Stays', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const picker = list(page).locator('.ss-stay-picker');
    await expect(picker.getByRole('button', { name: 'Most sun', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await picker.getByRole('button', { name: 'Choose stay date', exact: true }).tap();
    await picker.getByRole('button', { name: 'Tomorrow', exact: true }).tap();
    await expect(list(page).locator('.ss-discovery-context')).toHaveText('Tomorrow · Tue 20 Oct · Most sun · Melbourne time');
    await rows(page).nth(0).getByRole('button', { name: 'Compare', exact: true }).tap();
    await rows(page).nth(1).getByRole('button', { name: 'Compare', exact: true }).tap();
    await picker.getByRole('button', { name: 'Compare (2/3)', exact: true }).tap();
    const comparison = page.getByRole('dialog', { name: 'Compare · Most sun', exact: true });
    await expect(comparison).toBeVisible();
    await expect(comparison.getByText('Tue 20 Oct', { exact: false }).first()).toBeVisible();
    await comparison.getByRole('button', { name: 'Close comparison', exact: true }).tap();
    await expect(comparison).toBeHidden();
    expect(errors).toEqual([]);
});

test('future room sun uses the selected date and marks geometry as potential sunlight', async ({ page, baseURL }, testInfo) => {
    const { errors } = await boot(page, baseURL);
    await page.getByRole('button', { name: 'Morning stays Explore room sun', exact: true }).tap();
    const picker = list(page).locator('.ss-stay-picker');
    await picker.getByRole('button', { name: 'Choose stay date', exact: true }).tap();
    await picker.getByLabel('Pick a date', { exact: true }).fill('2026-10-22');
    await picker.getByRole('button', { name: 'Choose stay date', exact: true }).tap();
    await expect(list(page).locator('.ss-discovery-context')).toHaveText('Thu 22 Oct · Morning coffee · Melbourne time');
    await rows(page).first().tap();
    const card = page.getByRole('article');
    await expect(card).toBeVisible();
    await card.getByRole('heading', { name: 'Sun by side of the building', exact: true }).scrollIntoViewIfNeeded();
    await expect(card.getByText('Thu 22 Oct · Melbourne time', { exact: true }).first()).toBeVisible();
    await expect(card.getByText(/of potential sun .* on Thu 22 Oct$/).first()).toBeVisible();
    await expect(card.getByText(/of potential sun .* today$/)).toHaveCount(0);
    await expect(card.getByText(/No weather forecast is shown here/).first()).toBeVisible();
    await expect(card.getByRole('img', { name: /Marker shows now/ })).toHaveCount(0);
    const screenshot = testInfo.outputPath('future-room-sun-390.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('Selected-date room sun at 390×844', { path: screenshot, contentType: 'image/png' });
    expect(errors).toEqual([]);
});

test('keyboard presets, missing weather and empty results stay usable', async ({ page, baseURL }) => {
    const { errors } = await boot(page, baseURL, { unavailable: true });
    const finder = page.getByRole('region', { name: 'Find your kind of day', exact: true });
    await expect(page.locator('.ss-mobile-sheet-handle').getByText(/Sample listings · forecast unavailable/)).toBeVisible();
    const options = finder.getByRole('group', { name: 'Find an experience', exact: true }).getByRole('button');
    const targets = await options.evaluateAll(buttons => buttons.map(button => ({ w: button.getBoundingClientRect().width, h: button.getBoundingClientRect().height })));
    expect(targets).toHaveLength(4);
    expect(targets.every(target => target.w >= 44 && target.h >= 44)).toBe(true);
    await options.first().focus();
    await page.keyboard.press('Tab');
    await expect(options.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list(page).getByRole('button', { name: 'Cozy', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(list(page).getByRole('heading', { name: 'Venues', exact: true })).toBeFocused();
    await list(page).getByRole('textbox', { name: 'Search venues', exact: true }).fill('zzzz-no-such-venue');
    await expect(list(page).getByRole('button', { name: /clear filters/i })).toBeVisible();
    await expect(list(page).locator('.ss-discovery-source')).toContainText('forecast unavailable');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    expect(errors).toEqual([]);
});

test('loading and successful live-source states have honest labels', async ({ page, baseURL }) => {
    const { errors, venueRequest } = await boot(page, baseURL, { delayedVenues: true });
    const finder = page.getByRole('region', { name: 'Find your kind of day', exact: true });
    await expect(page.locator('.ss-mobile-sheet-handle').getByText(/Loading listings/)).toBeVisible();
    await expect.poll(venueRequest).toBeTruthy();
    await venueRequest().fulfill({ json: [{ id: 'fixture-cafe', venue_name: 'Fixture Cafe', lat: -37.81, lng: 144.96,
        typeLabel: 'Cafe', typeCategory: 'Bar', tags: ['Outdoor Seating'] }] });
    await expect(page.locator('.ss-mobile-sheet-handle').getByText(/Venue listings · Open-Meteo forecast/)).toBeVisible();
    await expect(page.locator('.ss-mobile-sheet-handle').getByText(/Sample listings/)).toHaveCount(0);
    expect(errors).toEqual([]);
});

for (const [width, height] of [[320, 568], [768, 1024], [1440, 1024]]) {
    test.describe(`experience discovery at ${width}px`, () => {
        test.use({ viewport: { width, height }, isMobile: width < 1024 });
        test('fits and keeps the stay intent tappable', async ({ page, baseURL }) => {
            const { errors } = await boot(page, baseURL);
            await page.getByRole('button', { name: 'Morning stays Explore room sun', exact: true }).click();
            const picker = page.locator('.ss-stay-picker').filter({ visible: true });
            await expect(picker.getByRole('button', { name: 'Morning coffee', exact: true })).toHaveAttribute('aria-pressed', 'true');
            if (width === 320) {
                await picker.getByRole('button', { name: 'Choose stay date', exact: true }).tap();
                await picker.getByLabel('Pick a date', { exact: true }).fill('2026-10-22');
                await expect(picker.getByLabel('Pick a date', { exact: true })).toHaveValue('2026-10-22');
                const scroller = list(page).locator('[data-virtuoso-scroller="true"]');
                expect((await scroller.boundingBox()).height).toBeGreaterThan(44);
                await picker.getByRole('button', { name: 'Choose stay date', exact: true }).tap();
                await expect(rows(page).first()).toBeVisible();
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            expect(errors).toEqual([]);
        });
    });
}
