import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activeSunMoments, cacheHorizonRows, createSunMomentsJob, chunkIds, HORIZON_BATCH_SIZE, horizonIdsToFetch, inlineSunHorizons, sameSunMomentInputs, isSunMomentFilter, momentInSun,
    SUN_MOMENT_FILTERS, sunMomentEmptyState, sunMomentsByVenue, venueMatchesSunMoments, venueSunMomentKeys,
} from './sunMomentFilters.js';
import { outdoorSunDay } from './sunMoments.js';
import { venueHour } from './venueTime.js';

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

test('the sliced job gives exactly the sunMomentsByVenue result', () => {
    const horizons = new Map([['1', open], ['2', westWall], ['3', null], ['5', open]]);
    const list = [venue(1), null, venue('2'), venue('3'), venue('4'), venue('5'), { lat: LAT }];
    const whole = sunMomentsByVenue(list, horizons, { now: NOW });
    const job = createSunMomentsJob(list, horizons, { now: NOW });
    let slices = 0;
    assert.equal(job.done, false);
    while (!job.run(() => true)) slices++;   // yield after every venue
    assert.equal(job.done, true);
    assert.equal(slices, list.length - 1, 'each slice handles one venue');
    assert.deepEqual([...job.result], [...whole]);
    assert.equal(job.run(() => true), true, 'running a finished job is a no-op');
    assert.equal(createSunMomentsJob(null, horizons).done, true);
    assert.equal(createSunMomentsJob(list, null).done, true);
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

// The CBD's sunset on NOW's date, as the forecast would carry it.
const SUNSET_HOUR = venueHour(outdoorSunDay({ lat: LAT, lng: LNG, horizon: open, date: '2026-10-15', timeZone: 'Australia/Melbourne' }).sunset, 'Australia/Melbourne');
const skyAt = (kindAt) => ({ ...sky(kindAt), sunsetHour: SUNSET_HOUR });
const evening = (h) => h >= 17 && h <= 19;

test('a rainy sunset explains the empty list, and no venue matches under it', () => {
    const forecast = skyAt((h) => (evening(h) ? 'rain' : h >= 7 && h < 20 ? 'sun' : 'night'));
    const state = sunMomentEmptyState({ filters: ['moment-sunset'], forecast });
    assert.equal(state.badgeLabel, 'Forecast');
    assert.equal(state.title, 'No sun forecast around sunset');
    assert.match(state.message, /^Rain is forecast from \d{1,2}(:\d\d)?pm to \d{1,2}(:\d\d)?pm today, so no venue is likely to get sunset sun\.$/);
    // Same forecast through the real matcher: an open-sky venue gets no sunset key.
    const keys = sunMomentsByVenue([venue('open')], new Map([['open', open]]), { forecast, now: NOW }).get('open') ?? [];
    assert.equal(keys.includes('sunset'), false);
});

test('one sunny hour in the moment keeps the usual empty state, and a venue can match', () => {
    const hour = Math.floor(SUNSET_HOUR);
    const forecast = skyAt((h) => (h === hour ? 'sun' : evening(h) ? 'rain' : h >= 7 && h < 20 ? 'sun' : 'night'));
    assert.equal(sunMomentEmptyState({ filters: ['moment-sunset'], forecast }), null);
    const keys = sunMomentsByVenue([venue('open')], new Map([['open', open]]), { forecast, now: NOW }).get('open') ?? [];
    assert.equal(keys.includes('sunset'), true);
});

test('cloud, mixed skies and other moments get their own words', () => {
    const cloud = sunMomentEmptyState({ filters: ['moment-sunset'], forecast: skyAt((h) => (evening(h) ? 'cloud' : 'sun')) });
    assert.match(cloud.message, /^Cloud is forecast /);
    const mixed = skyAt((h) => (h === Math.floor(SUNSET_HOUR) ? 'cloud' : evening(h) ? 'rain' : 'sun'));
    assert.match(sunMomentEmptyState({ filters: ['moment-sunset'], forecast: mixed }).message, /^Rain and cloud are forecast /);
    const lunch = sunMomentEmptyState({ filters: ['moment-lunch'], forecast: skyAt((h) => (h >= 12 && h <= 14 ? 'rain' : 'sun')) });
    assert.equal(lunch.title, 'No sun forecast over lunch');
    assert.equal(lunch.message, 'Rain is forecast from 12pm to 2:30pm today, so no venue is likely to get lunch sun.');
});

test('without a clear forecast verdict the usual empty state stays', () => {
    const rainy = skyAt((h) => (evening(h) ? 'rain' : 'sun'));
    assert.equal(sunMomentEmptyState({ filters: ['Rooftop'], forecast: rainy }), null);
    assert.equal(sunMomentEmptyState({ filters: ['moment-sunset'], forecast: null }), null);
    assert.equal(sunMomentEmptyState({ filters: ['moment-sunset'], forecast: { hasHourly: false, hours: [] } }), null);
    // An hour with no forecast data ('day') could still let a venue match.
    assert.equal(sunMomentEmptyState({ filters: ['moment-sunset'], forecast: skyAt((h) => (h === Math.floor(SUNSET_HOUR) ? 'day' : evening(h) ? 'rain' : 'sun')) }), null);
    // No sunset time: the sunset moment has no window to judge.
    assert.equal(sunMomentEmptyState({ filters: ['moment-sunset'], forecast: sky((h) => (evening(h) ? 'rain' : 'sun')) }), null);
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
