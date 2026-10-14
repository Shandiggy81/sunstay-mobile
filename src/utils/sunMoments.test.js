import test from 'node:test';
import assert from 'node:assert/strict';
import { horizonToObstructions, outdoorSunDay, sunMomentsFromDay, SUN_MOMENTS } from './sunMoments.js';

const LAT = -37.8136, LNG = 144.9631;
const open = Array(36).fill(0);

test('horizon becomes 10° obstruction sectors, skipping open sky', () => {
    const h = [...open]; h[0] = 30; h[18] = 95; h[5] = 0.2;
    assert.deepEqual(horizonToObstructions(h), [
        { start: 0, end: 10, minAltitude: 30 },
        { start: 180, end: 190, minAltitude: 89.9 },
    ]);
    assert.equal(horizonToObstructions([1, 2]), null);
    assert.equal(horizonToObstructions(null), null);
});

test('an open site gets every moment on a spring day', () => {
    const daily = outdoorSunDay({ lat: LAT, lng: LNG, horizon: open, date: '2026-10-15' });
    assert.ok(daily.totalMinutes > 12 * 60, String(daily.totalMinutes));
    const { moments } = sunMomentsFromDay({ daily });
    assert.deepEqual(moments.map((m) => m.key), SUN_MOMENTS.map((m) => m.key));
    assert.ok(moments.every((m) => m.available), JSON.stringify(moments.map((m) => [m.key, m.available])));
});

test('a tall wall to the west takes away sunset drinks but keeps morning coffee', () => {
    const h = [...open];
    for (let s = 21; s <= 33; s += 1) h[s] = 60;   // bearings 210–340°
    const daily = outdoorSunDay({ lat: LAT, lng: LNG, horizon: h, date: '2026-10-15' });
    const m = Object.fromEntries(sunMomentsFromDay({ daily }).moments.map((x) => [x.key, x]));
    assert.equal(m.coffee.available, true);
    assert.equal(m.sunset.available, false);
});

test('a deep laneway gets only the midday slot', () => {
    const h = open.map((_, s) => (s >= 34 || s <= 1 ? 25 : 80));   // open only to the north
    const daily = outdoorSunDay({ lat: LAT, lng: LNG, horizon: h, date: '2026-10-15' });
    const m = Object.fromEntries(sunMomentsFromDay({ daily }).moments.map((x) => [x.key, x]));
    assert.equal(m.coffee.available, false);
    assert.equal(m.lunch.available, true);
    assert.ok(daily.totalMinutes < 4 * 60, String(daily.totalMinutes));
});

test('each moment carries the forecast sky', () => {
    const daily = outdoorSunDay({ lat: LAT, lng: LNG, horizon: open, date: '2026-10-15' });
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, kind: h >= 12 && h < 15 ? 'cloud' : 'sun' }));
    const m = Object.fromEntries(sunMomentsFromDay({ daily, forecast: { hasHourly: true, hours } }).moments.map((x) => [x.key, x]));
    assert.equal(m.coffee.sky, 'sun');
    assert.equal(m.lunch.sky, 'cloud');
    assert.equal(m.sunset.sky, 'sun');
    assert.equal(sunMomentsFromDay({ daily }).moments[0].sky, null);
});

test('no horizon, no answer', () => {
    assert.equal(outdoorSunDay({ lat: LAT, lng: LNG, horizon: null, date: '2026-10-15' }), null);
});

import { parseSunHorizon } from './sunMoments.js';
test('stored horizons must be 36 numbers', () => {
    assert.deepEqual(parseSunHorizon(Array(36).fill('12.5')), Array(36).fill(12.5));
    assert.equal(parseSunHorizon(Array(35).fill(1)), null);
    assert.equal(parseSunHorizon([...Array(35).fill(1), null]), null);
    assert.equal(parseSunHorizon(undefined), null);
});

import { roomsBySunToday } from './sunMoments.js';
test('rooms are listed sunniest first, with a pinned room on top', () => {
    const venue = { lat: LAT, lng: LNG };
    const south = { id: 's', orientation: 180, obstructions: [] };
    const north = { id: 'n', orientation: 0, obstructions: [] };
    const broken = { id: 'x', orientation: 'nowhere' };
    assert.deepEqual(roomsBySunToday([south, broken, north], venue, '2026-06-21').map((r) => r.id), ['n', 's', 'x']);
    assert.deepEqual(roomsBySunToday([south, north], venue, '2026-06-21', south).map((r) => r.id), ['s', 'n']);
});
