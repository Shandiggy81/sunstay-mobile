import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterDarkOrigin, afterDarkPriceLabel, afterDarkTitle, formatAfterDarkPrice, formatAfterDarkTime, resolveAfterDarkMode,
    shouldFetchAfterDark, tonightsEvents } from './afterDarkHome.js';

const origin = { lat: -37.8136, lng: 144.9631 };
const north = metres => ({ lat: origin.lat + metres / 6371000 * 180 / Math.PI, lng: origin.lng });

test('origin follows the existing viewport centre, with a valid initial-map fallback', () => {
    const bbox = { minLat: -38, maxLat: -37, minLng: 144, maxLng: 146 };
    assert.deepEqual(afterDarkOrigin(bbox, origin), { lat: -37.5, lng: 145 });
    const center = { lat: -37.8, lng: 144.9 };
    assert.deepEqual(afterDarkOrigin(bbox, origin, center), center, 'the actual map centre wins over bounds on a pitched map');
    assert.deepEqual(afterDarkOrigin(bbox, origin, { lat: NaN, lng: 144 }), { lat: -37.5, lng: 145 });
    assert.deepEqual(afterDarkOrigin(null, origin, { lat: -100, lng: 144 }), origin);
    for (const bbox of [null, {}, { minLat: 1, maxLat: 0, minLng: 144, maxLng: 146 },
        { minLat: -38, maxLat: -37, minLng: null, maxLng: 146 },
        { minLat: -38, maxLat: -37, minLng: 144, maxLng: 181 }]) {
        assert.deepEqual(afterDarkOrigin(bbox, origin), origin);
    }
    assert.equal(afterDarkOrigin(null, { lat: NaN, lng: 144 }), null);
});

test('night defaults to After Dark while daytime defaults to Sun', () => {
    assert.equal(resolveAfterDarkMode(null, true), 'after-dark');
    assert.equal(resolveAfterDarkMode(undefined, false), 'sun');
    assert.equal(resolveAfterDarkMode('invalid', true), 'after-dark');
});

test('a valid session choice wins over the current day/night default', () => {
    for (const night of [true, false]) {
        assert.equal(resolveAfterDarkMode('sun', night), 'sun');
        assert.equal(resolveAfterDarkMode('after-dark', night), 'after-dark');
    }
});

test('events fetch only when the mode is open and has a valid origin', () => {
    assert.equal(shouldFetchAfterDark({ open: false, origin }), false);
    assert.equal(shouldFetchAfterDark({ open: false, origin, retry: true }), false);
    assert.equal(shouldFetchAfterDark({ open: true, origin }), true);
    for (const point of [null, {}, { lat: null, lng: 144 }, { lat: NaN, lng: 144 },
        { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: '-37', lng: 144 }]) {
        assert.equal(shouldFetchAfterDark({ open: true, origin: point, retry: true }), false);
    }
});

test('the 1km threshold is measured from the last request, not each small pan', () => {
    const equator = { lat: 0, lng: 0 };
    const oneKilometre = { lat: 1000 / 6371000 * 180 / Math.PI, lng: 0 };
    assert.equal(shouldFetchAfterDark({ open: true, origin: oneKilometre, previousOrigin: equator }), false);
    assert.equal(shouldFetchAfterDark({ open: true, origin, previousOrigin: origin }), false);
    assert.equal(shouldFetchAfterDark({ open: true, origin: north(500), previousOrigin: origin }), false);
    assert.equal(shouldFetchAfterDark({ open: true, origin: north(999.9), previousOrigin: origin }), false);
    assert.equal(shouldFetchAfterDark({ open: true, origin: north(1000.1), previousOrigin: origin }), true);
    assert.equal(shouldFetchAfterDark({ open: true, origin: north(1500), previousOrigin: origin }), true);
});

test('explicit retry can replace an error at the same origin without automatic polling', () => {
    assert.equal(shouldFetchAfterDark({ open: true, origin, previousOrigin: origin, retry: true }), true);
    assert.equal(shouldFetchAfterDark({ open: true, origin, previousOrigin: origin }), false);
});

test('start and update times are Melbourne wall-clock times, including midnight and minutes', () => {
    assert.equal(formatAfterDarkTime('2026-10-22T08:00:00Z'), '7pm');
    assert.equal(formatAfterDarkTime('2026-10-22T08:30:00Z'), '7:30pm');
    assert.equal(formatAfterDarkTime('2026-10-22T19:00'), '7pm');
    assert.equal(formatAfterDarkTime('2026-10-22T13:05:00Z'), '12:05am');
    assert.equal(formatAfterDarkTime(new Date('2026-10-22T01:00:00Z')), '12pm');
    assert.equal(formatAfterDarkTime('2026-06-22T09:00:00Z'), '7pm');
});

test('time formatting follows Melbourne DST and rejects missing or invalid timestamps', () => {
    assert.equal(formatAfterDarkTime('2026-10-03T09:00:00Z'), '7pm');
    assert.equal(formatAfterDarkTime('2026-10-04T08:00:00Z'), '7pm');
    for (const value of [null, undefined, '', ' ', 'invalid', new Date(NaN), false]) {
        assert.equal(formatAfterDarkTime(value), '');
    }
});

test('only known positive prices get a From label, in dollars or dollars and cents', () => {
    assert.equal(formatAfterDarkPrice(45), 'From $45');
    assert.equal(formatAfterDarkPrice(45.5), 'From $45.50');
    assert.equal(formatAfterDarkPrice(1234.56), 'From $1,234.56');
    for (const value of [0, null, undefined, '45', '', NaN, Infinity, -1, false]) {
        assert.equal(formatAfterDarkPrice(value), null);
    }
});

test('Free only when the source says so; a $0 floor on a paid show gets no label', () => {
    assert.equal(afterDarkPriceLabel({ isFree: true, priceFrom: 0 }), 'Free');
    assert.equal(afterDarkPriceLabel({ isFree: true, priceFrom: null }), 'Free');
    assert.equal(afterDarkPriceLabel({ isFree: false, priceFrom: 0 }), null);
    assert.equal(afterDarkPriceLabel({ isFree: false, priceFrom: 59.9 }), 'From $59.90');
    assert.equal(afterDarkPriceLabel({ isFree: null, priceFrom: null }), null);
    assert.equal(afterDarkPriceLabel(null), null);
});

test('the 18+ badge replaces a trailing "(18+ Event)" in the title, and nothing else changes', () => {
    assert.equal(afterDarkTitle({ title: 'The House Soiree at Pipers Playhouse (18+ Event)', adultsOnly: true }), 'The House Soiree at Pipers Playhouse');
    assert.equal(afterDarkTitle({ title: 'Late Show [18+]', adultsOnly: true }), 'Late Show');
    assert.equal(afterDarkTitle({ title: 'Late Show (18+)', adultsOnly: false }), 'Late Show (18+)', 'no badge, so the title keeps it');
    assert.equal(afterDarkTitle({ title: '18+ Comedy Night', adultsOnly: true }), '18+ Comedy Night', 'only a trailing bracket is dropped');
    assert.equal(afterDarkTitle({ title: 'Band (Live) at the Forum', adultsOnly: true }), 'Band (Live) at the Forum');
    assert.equal(afterDarkTitle({ title: '(18+)', adultsOnly: true }), '(18+)', 'never an empty title');
    assert.equal(afterDarkTitle(null), '');
});

test("tonight's list shows one row per show, then applies the usual filters", () => {
    const now = new Date('2026-10-22T03:00:00Z'); // 2pm Melbourne
    const show = (over = {}) => ({ id: 'tm:1', source: 'ticketmaster', status: 'approved', title: 'The Murlocs', category: 'live-music',
        start: '2026-10-22T09:00:00Z', lat: -37.814, lng: 144.964, priceFrom: 49, isFree: false,
        ticketUrl: 'https://www.ticketmaster.com.au/a', adultsOnly: false, ...over });
    const events = [
        show(),
        show({ id: 'tm:2', title: 'The Murlocs (VIP Upgrade)', ticketUrl: 'https://www.ticketmaster.com.au/b' }),
        show({ id: 'tm:3', title: 'Comedy Gala', category: 'comedy', priceFrom: 0, isFree: true }),
    ];
    assert.deepEqual(tonightsEvents(events, { now, origin, maxKm: 3 }).map(e => e.id), ['tm:1', 'tm:3']);
    assert.deepEqual(tonightsEvents(events, { now, origin, maxKm: 3, freeOnly: true }).map(e => e.id), ['tm:3']);
    assert.deepEqual(tonightsEvents(events, { now, origin, maxKm: 3, categories: ['live-music'] }).map(e => e.id), ['tm:1']);
    assert.deepEqual(tonightsEvents(null, { now, origin }), []);
});
