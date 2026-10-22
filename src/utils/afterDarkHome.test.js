import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFTER_DARK_DEFAULT_ORIGIN, AFTER_DARK_LOCATION_RADIUS_METRES, AFTER_DARK_MIN_CAMERA_ZOOM, afterDarkOrigin, afterDarkPriceLabel, afterDarkTitle, formatAfterDarkPrice, formatAfterDarkTime, resolveAfterDarkMode,
    shouldFetchAfterDark, tonightsEvents } from './afterDarkHome.js';
import { MAX_BOUNDS } from '../config/mapBounds.js';

const origin = { lat: -37.8136, lng: 144.9631 };
const north = metres => ({ lat: origin.lat + metres / 6371000 * 180 / Math.PI, lng: origin.lng });

const defaultOrigin = { lat: -37.8183, lng: 144.9671, kind: 'default', label: 'Walk times from Flinders St Station' };
const camera = { lat: -37.8159, lng: 144.9679, zoom: 14 };

test('without a camera the origin is Flinders St Station, even after Locate Me', () => {
    assert.deepEqual(AFTER_DARK_DEFAULT_ORIGIN, { lat: -37.8183, lng: 144.9671 });
    assert.deepEqual(afterDarkOrigin(), defaultOrigin);
    assert.deepEqual(afterDarkOrigin(null, origin), defaultOrigin);
    assert.deepEqual(afterDarkOrigin({ minLat: -38, maxLat: -37, minLng: 144, maxLng: 146 }), defaultOrigin,
        'a viewport bbox is not a camera and must never supply the origin');
});

test('zoom 13.9 uses Flinders St; zoom 14 and closer use the real camera centre', () => {
    assert.equal(AFTER_DARK_MIN_CAMERA_ZOOM, 14);
    assert.deepEqual(afterDarkOrigin({ ...camera, zoom: 13.9 }), defaultOrigin);
    for (const zoom of [14, 14.1, 18]) {
        assert.deepEqual(afterDarkOrigin({ ...camera, zoom }), {
            lat: camera.lat, lng: camera.lng, kind: 'map', label: 'Walk times from the map centre',
        });
    }
});

test('invalid camera coordinates or zoom use Flinders St instead of another fallback', () => {
    for (const invalid of [null, undefined, NaN, Infinity, '', '14', false]) {
        assert.deepEqual(afterDarkOrigin({ ...camera, zoom: invalid }), defaultOrigin);
    }
    for (const coordinate of ['lat', 'lng']) {
        for (const invalid of [null, undefined, NaN, Infinity, '', '144', false]) {
            assert.deepEqual(afterDarkOrigin({ ...camera, [coordinate]: invalid }), defaultOrigin);
        }
    }
    assert.deepEqual(afterDarkOrigin({ lat: -91, lng: 144, zoom: 14 }), defaultOrigin);
    assert.deepEqual(afterDarkOrigin({ lat: -37, lng: 181, zoom: 14 }), defaultOrigin);
});

test('camera centres outside MAX_BOUNDS use Flinders St; boundary points remain valid', () => {
    const [[minLng, minLat], [maxLng, maxLat]] = MAX_BOUNDS;
    for (const point of [
        { lat: minLat - .0001, lng: camera.lng }, { lat: maxLat + .0001, lng: camera.lng },
        { lat: camera.lat, lng: minLng - .0001 }, { lat: camera.lat, lng: maxLng + .0001 },
    ]) assert.deepEqual(afterDarkOrigin({ ...point, zoom: 14 }), defaultOrigin);
    for (const point of [{ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }]) {
        assert.equal(afterDarkOrigin({ ...point, zoom: 14 }).kind, 'map');
    }
});

test('a camera within 150m of the last Locate Me point keeps the camera coordinates and location label', () => {
    assert.equal(AFTER_DARK_LOCATION_RADIUS_METRES, 150);
    const locatedNorth = metres => ({ lat: camera.lat + metres / 6371000 * 180 / Math.PI, lng: camera.lng });
    for (const metres of [0, 100, 149.9, 150]) {
        assert.deepEqual(afterDarkOrigin(camera, locatedNorth(metres)), {
            lat: camera.lat, lng: camera.lng, kind: 'location', label: 'Walk times from your location',
        });
    }
    assert.equal(afterDarkOrigin(camera, locatedNorth(150.1)).kind, 'map');
    assert.equal(afterDarkOrigin(camera, { lat: NaN, lng: camera.lng }).kind, 'map');
    assert.equal(afterDarkOrigin({ ...camera, zoom: 13.9 }, camera).kind, 'default', 'zoom rule still wins near a location');
});

test('the chosen origin drives radius and walking distance, without label changes triggering a fetch', () => {
    const now = new Date('2026-10-22T03:00:00Z');
    const chosen = afterDarkOrigin({ lat: -37.8232, lng: 144.9924, zoom: 13.9 });
    const event = metres => ({ id: String(metres), source: 'ticketmaster', status: 'approved', title: `Show ${metres}`,
        category: 'theatre', start: '2026-10-22T09:00:00Z', lat: chosen.lat + metres / 6371000 * 180 / Math.PI, lng: chosen.lng });
    const listed = tonightsEvents([event(2900), event(3100)], { now, origin: chosen, maxKm: 3 });
    assert.deepEqual(listed.map(item => [item.id, item.distanceMetres, item.walkMinutes]), [['2900', 2900, 36]]);
    const mapOrigin = afterDarkOrigin(camera);
    const locationOrigin = afterDarkOrigin(camera, camera);
    assert.equal(shouldFetchAfterDark({ open: true, origin: locationOrigin, previousOrigin: mapOrigin }), false);
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
