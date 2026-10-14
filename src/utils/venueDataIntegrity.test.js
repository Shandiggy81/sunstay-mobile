import test from 'node:test';
import assert from 'node:assert/strict';
import { demoVenues } from '../data/demoVenues.js';
import { MAX_BOUNDS } from '../config/mapBounds.js';

// Venue pairs that really share a site may sit closer than MIN_SEPARATION_M.
// Add a pair only with a reason; a near-duplicate pin is usually a copied coordinate.
const ALLOWED_NEAR_PAIRS = new Set([
    // e.g. 'dv-a|dv-b', // both inside the same building
]);
const MIN_SEPARATION_M = 10;
const STAY_TYPES = new Set(['Hotel', 'Serviced apartment']);

const metresBetween = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
};
const pairKey = (a, b) => [a.id, b.id].sort().join('|');

test('demo venues exist', () => {
    assert.ok(Array.isArray(demoVenues) && demoVenues.length > 0);
});

test('every demo venue id is unique', () => {
    const seen = new Set();
    const dupes = demoVenues.map((v) => v.id).filter((id) => seen.has(id) || !seen.add(id));
    assert.deepEqual(dupes, []);
    assert.ok(demoVenues.every((v) => v.id != null && String(v.id).trim() !== ''));
});

test('every demo venue has a non-empty venueName', () => {
    const bad = demoVenues.filter((v) => typeof v.venueName !== 'string' || v.venueName.trim() === '');
    assert.deepEqual(bad.map((v) => v.id), []);
});

test('every demo venue has finite coordinates inside MAX_BOUNDS', () => {
    const [[west, south], [east, north]] = MAX_BOUNDS;
    const bad = demoVenues.filter((v) => !(Number.isFinite(v.lat) && Number.isFinite(v.lng)
        && v.lat >= south && v.lat <= north && v.lng >= west && v.lng <= east));
    assert.deepEqual(bad.map((v) => `${v.id} (${v.lat}, ${v.lng})`), []);
});

test('every hotel and serviced apartment has room types with a numeric orientation', () => {
    const stays = demoVenues.filter((v) => STAY_TYPES.has(v.typeCategory));
    assert.ok(stays.length > 0);
    const bad = stays.filter((v) => !Array.isArray(v.roomTypes) || v.roomTypes.length === 0
        || !v.roomTypes.every((r) => Number.isFinite(r?.orientation)));
    assert.deepEqual(bad.map((v) => v.id), []);
});

test(`no two demo venues sit within ${MIN_SEPARATION_M} m of each other unless allowed`, () => {
    const close = [];
    for (let i = 0; i < demoVenues.length; i++) {
        for (let j = i + 1; j < demoVenues.length; j++) {
            const a = demoVenues[i], b = demoVenues[j];
            const m = metresBetween(a, b);
            if (m < MIN_SEPARATION_M && !ALLOWED_NEAR_PAIRS.has(pairKey(a, b))) {
                close.push(`${a.id} / ${b.id}: ${m.toFixed(1)} m`);
            }
        }
    }
    assert.deepEqual(close, []);
});

test('the separation check catches a copied coordinate', () => {
    const a = { id: 'a', lat: -37.8552, lng: 144.9926 };
    assert.ok(metresBetween(a, { id: 'b', lat: -37.85519, lng: 144.99258 }) < MIN_SEPARATION_M);
    assert.ok(metresBetween(a, { id: 'c', lat: -37.85212, lng: 144.99313 }) > 300);
});
