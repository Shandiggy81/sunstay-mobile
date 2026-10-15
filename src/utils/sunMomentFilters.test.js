import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activeSunMoments, cacheHorizonRows, chunkIds, HORIZON_BATCH_SIZE, horizonIdsToFetch, inlineSunHorizons, sameSunMomentInputs, isSunMomentFilter, momentInSun,
    SUN_MOMENT_FILTERS, sunMomentsByVenue, venueMatchesSunMoments, venueSunMomentKeys,
} from './sunMomentFilters.js';

const LAT = -37.8136, LNG = 144.9631;
const open = Array(36).fill(0);
const westWall = open.map((_, s) => (s >= 21 && s <= 33 ? 60 : 0));   // bearings 210–340°
// 2026-10-15 09:00 Melbourne (AEDT, UTC+11).
const NOW = new Date(Date.UTC(2026, 9, 14, 22, 0));
const venue = (id, extra = {}) => ({ id, lat: LAT, lng: LNG, ...extra });
const sky = (kindAt) => ({ hasHourly: true, hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, kind: kindAt(h) })) });

test('the three chips are coffee, lunch and sunset with their clay icons', () => {
    assert.deepEqual(SUN_MOMENT_FILTERS.map((f) => [f.label, f.icon]), [
        ['Coffee sun', 'coffee'], ['Lunch sun', 'dining'], ['Sunset drinks', 'cocktail'],
    ]);
    assert.ok(SUN_MOMENT_FILTERS.every((f) => !f.id.startsWith('sun-') && !f.id.startsWith('all-')));
    assert.equal(isSunMomentFilter('moment-sunset'), true);
    assert.equal(isSunMomentFilter('sunny-mode'), false);
    assert.deepEqual(activeSunMoments(['Rooftop', 'moment-sunset', 'moment-coffee']), ['sunset', 'coffee']);
    assert.deepEqual(activeSunMoments(null), []);
});

test('a moment counts only with sun available and no cloud or rain', () => {
    assert.equal(momentInSun({ available: true, sky: 'sun' }), true);
    assert.equal(momentInSun({ available: true, sky: null }), true);
    assert.equal(momentInSun({ available: true, sky: 'cloud' }), false);
    assert.equal(momentInSun({ available: true, sky: 'rain' }), false);
    assert.equal(momentInSun({ available: false, sky: 'sun' }), false);
    assert.equal(momentInSun({ available: null, sky: null }), false);
});

test('an open site gets every moment; a west wall loses sunset', () => {
    assert.deepEqual(venueSunMomentKeys({ venue: venue('a'), horizon: open, now: NOW }), ['coffee', 'lunch', 'afternoon', 'sunset']);
    const walled = venueSunMomentKeys({ venue: venue('b'), horizon: westWall, now: NOW });
    assert.ok(walled.includes('coffee'));
    assert.ok(!walled.includes('sunset'));
});

test('a cloudy or rainy forecast for the moment takes it away', () => {
    const forecast = sky((h) => (h >= 12 && h < 15 ? 'cloud' : h >= 17 ? 'rain' : 'sun'));
    assert.deepEqual(venueSunMomentKeys({ venue: venue('a'), horizon: open, forecast, now: NOW }), ['coffee', 'afternoon']);
});

test('venues without a horizon or position never match', () => {
    assert.deepEqual(venueSunMomentKeys({ venue: venue('a'), horizon: null, now: NOW }), []);
    assert.deepEqual(venueSunMomentKeys({ venue: venue('a'), horizon: [1, 2, 3], now: NOW }), []);
    assert.deepEqual(venueSunMomentKeys({ venue: { id: 'x' }, horizon: open, now: NOW }), []);
    assert.deepEqual(venueSunMomentKeys({ venue: venue('a', { timeZone: 'Not/AZone' }), horizon: open, now: NOW }), []);
});

test('sunMomentsByVenue maps only venues with sun in some moment', () => {
    const horizons = new Map([['1', open], ['2', westWall], ['3', null]]);
    const out = sunMomentsByVenue([venue(1), venue('2'), venue('3'), venue('4'), null], horizons, { now: NOW });
    assert.deepEqual([...out.keys()], ['1', '2']);
    assert.ok(out.get('1').includes('sunset'));
    assert.ok(!out.get('2').includes('sunset'));
    assert.equal(sunMomentsByVenue(null, horizons).size, 0);
    assert.equal(sunMomentsByVenue([venue(1)], null).size, 0);
});

test('a venue must have sun in every chosen moment', () => {
    assert.equal(venueMatchesSunMoments(['coffee', 'sunset'], ['sunset']), true);
    assert.equal(venueMatchesSunMoments(['coffee'], ['coffee', 'sunset']), false);
    assert.equal(venueMatchesSunMoments(undefined, ['coffee']), false);
    assert.equal(venueMatchesSunMoments(undefined, []), true);
});

test('only uncached ids are fetched, once each', () => {
    const cache = new Map([['a', null]]);
    assert.deepEqual(horizonIdsToFetch(['a', 'b', 2, 'b', null, ''], cache), ['b', '2']);
    assert.deepEqual(horizonIdsToFetch(null, cache), []);
});

test('fetched rows fill the cache, and missing ids are cached as null', () => {
    const cache = cacheHorizonRows(new Map(), ['a', 'b', 'c'], [
        { venue_id: 'a', sun_horizon_deg: open },
        { venue_id: 'b', sun_horizon_deg: [1, 2] },
    ]);
    assert.deepEqual(cache.get('a'), open);
    assert.equal(cache.get('b'), null);
    assert.ok(cache.has('c'));
    assert.equal(cache.get('c'), null);
});

test('chunkIds splits large id lists into request-sized batches', () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `v${i}`);
    const batches = chunkIds(ids);
    assert.equal(batches.length, Math.ceil(1001 / HORIZON_BATCH_SIZE));
    assert.ok(batches.every((b) => b.length <= HORIZON_BATCH_SIZE));
    assert.deepEqual(batches.flat(), ids);
    assert.deepEqual(chunkIds(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
    assert.deepEqual(chunkIds([], 2), []);
    assert.deepEqual(chunkIds(null), []);
    assert.deepEqual(chunkIds(['a', 'b'], 0), [['a', 'b']]);
});

test('inlineSunHorizons keeps venues that carry a horizon, even a null one', () => {
    const h = Array.from({ length: 36 }, (_, i) => i);
    const map = inlineSunHorizons([
        { id: 'a', sun_horizon_deg: h },
        { id: 2, sun_horizon_deg: null },
        { id: 'c', sun_horizon_deg: [1, 2] },
        { id: 'd' },
        null,
    ]);
    assert.deepEqual([...map.keys()], ['a', '2', 'c']);
    assert.deepEqual(map.get('a'), h);
    assert.equal(map.get('2'), null);
    assert.equal(map.get('c'), null);
    assert.equal(inlineSunHorizons(null).size, 0);
});

test('sameSunMomentInputs reuses a result only for identical inputs on the same day', () => {
    const venues = [], horizons = new Map(), weather = {};
    const base = { venues, horizons, weather, day: '2026-10-15' };
    assert.equal(sameSunMomentInputs(base, { ...base }), true);
    assert.equal(sameSunMomentInputs(base, { ...base, day: '2026-10-16' }), false);
    assert.equal(sameSunMomentInputs(base, { ...base, venues: [] }), false);
    assert.equal(sameSunMomentInputs(base, { ...base, horizons: new Map() }), false);
    assert.equal(sameSunMomentInputs(base, { ...base, weather: {} }), false);
    assert.equal(sameSunMomentInputs(null, base), false);
    assert.equal(sameSunMomentInputs(base, undefined), false);
});
