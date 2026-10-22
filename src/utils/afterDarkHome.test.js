import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterDarkOrigin, formatAfterDarkPrice, formatAfterDarkTime, resolveAfterDarkMode, shouldFetchAfterDark } from './afterDarkHome.js';

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

test('only known nonnegative prices get a From label', () => {
    assert.equal(formatAfterDarkPrice(45), 'From $45');
    assert.equal(formatAfterDarkPrice(45.5), 'From $45.5');
    assert.equal(formatAfterDarkPrice(1234.56), 'From $1,234.56');
    assert.equal(formatAfterDarkPrice(0), 'From $0');
    for (const value of [null, undefined, '45', '', NaN, Infinity, -1, false]) {
        assert.equal(formatAfterDarkPrice(value), null);
    }
});
