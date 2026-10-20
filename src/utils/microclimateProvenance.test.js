import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    freshMicroclimateEntry,
    isMicroclimateEntryExpired,
    mapCaptionProvenance,
    newestWeatherComputedAt,
    timestampMs,
} from './microclimateProvenance.js';

const NOW = Date.parse('2026-10-20T02:00:00Z');
const MIN = 60_000;
const iso = (ms) => new Date(ms).toISOString();
const BBOX = { minLng: 144.9, minLat: -37.9, maxLng: 145.0, maxLat: -37.8 };

const venue = (id, inside = true) => ({ id, lat: inside ? -37.85 : -37.5, lng: 144.95 });
// sun_now alone gives readMicroclimate a sun reading, so the pin colour comes from the profile.
const row = ({ computedMinAgo = 10, expiresInMin } = {}) => ({
    sun_now: 0.8,
    weather_computed_at: computedMinAgo == null ? null : iso(NOW - computedMinAgo * MIN),
    ...(expiresInMin === undefined ? {} : { expires_at: iso(NOW + expiresInMin * MIN) }),
});

const caption = (venues, microById, extra = {}) =>
    mapCaptionProvenance({ venues, bbox: BBOX, microById, weatherKind: 'live', weatherFetchedAt: NOW - MIN, now: NOW, ...extra });

describe('timestampMs', () => {
    it('reads epoch ms, Dates and Postgres timestamptz strings', () => {
        assert.equal(timestampMs(NOW), NOW);
        assert.equal(timestampMs(new Date(NOW)), NOW);
        assert.equal(timestampMs('2026-10-20T02:00:00.123456+00:00'), NOW + 123);
    });

    it('returns null for missing or unreadable values', () => {
        for (const value of [null, undefined, '', 'not a date', NaN, new Date('x'), {}]) {
            assert.equal(timestampMs(value), null);
        }
    });
});

describe('isMicroclimateEntryExpired / freshMicroclimateEntry', () => {
    it('treats a missing or unreadable expires_at as not expired', () => {
        assert.equal(isMicroclimateEntryExpired({}, NOW), false);
        assert.equal(isMicroclimateEntryExpired({ expires_at: null }, NOW), false);
        assert.equal(isMicroclimateEntryExpired({ expires_at: 'soon' }, NOW), false);
    });

    it('expires at and after expires_at, not before', () => {
        assert.equal(isMicroclimateEntryExpired({ expires_at: iso(NOW + MIN) }, NOW), false);
        assert.equal(isMicroclimateEntryExpired({ expires_at: iso(NOW) }, NOW), true);
        assert.equal(isMicroclimateEntryExpired({ expires_at: iso(NOW - MIN) }, NOW), true);
    });

    it('returns the row only while it is fresh', () => {
        const fresh = row({ expiresInMin: 5 });
        const stale = row({ expiresInMin: -5 });
        assert.equal(freshMicroclimateEntry({ a: fresh, b: stale }, 'a', NOW), fresh);
        assert.equal(freshMicroclimateEntry({ a: fresh, b: stale }, 'b', NOW), null);
        assert.equal(freshMicroclimateEntry({}, 'a', NOW), null);
    });
});

describe('newestWeatherComputedAt', () => {
    it('returns the newest readable time across all rows', () => {
        const byId = { a: row({ computedMinAgo: 30 }), b: row({ computedMinAgo: 5 }), c: row({ computedMinAgo: null }) };
        assert.equal(newestWeatherComputedAt(byId), NOW - 5 * MIN);
    });

    it('returns null without readable times', () => {
        assert.equal(newestWeatherComputedAt({}), null);
        assert.equal(newestWeatherComputedAt(null), null);
        assert.equal(newestWeatherComputedAt({ a: row({ computedMinAgo: null }) }), null);
    });
});

describe('mapCaptionProvenance', () => {
    it('describes all-fresh profile pins as calculated, aged by the oldest computed time', () => {
        const venues = [venue('a'), venue('b'), venue('c')];
        const byId = {
            a: row({ computedMinAgo: 3, expiresInMin: 20 }),
            b: row({ computedMinAgo: 12, expiresInMin: 10 }),
            c: row({ computedMinAgo: 7, expiresInMin: 15 }),
        };
        assert.deepEqual(caption(venues, byId), {
            kind: 'calculated',
            updatedAt: NOW - 12 * MIN,
            source: '3 of 3 pins from SunStay microclimate, 0 from Open-Meteo weather',
        });
    });

    it('ignores expired rows for the share and the age in a mixed viewport', () => {
        const venues = [venue('a'), venue('b'), venue('c'), venue('d')];
        const byId = {
            a: row({ computedMinAgo: 5, expiresInMin: 20 }),
            b: row({ computedMinAgo: 8, expiresInMin: 20 }),
            c: row({ computedMinAgo: 300, expiresInMin: -240 }), // stale: must not drag the age
            d: row({ computedMinAgo: 200, expiresInMin: -1 }),
        };
        assert.deepEqual(caption(venues, byId), {
            kind: 'calculated',
            updatedAt: NOW - 8 * MIN,
            source: '2 of 4 pins from SunStay microclimate, 2 from Open-Meteo weather',
        });
    });

    it('falls back to the weather badge when every on-screen row has expired', () => {
        const venues = [venue('a'), venue('b')];
        const byId = { a: row({ expiresInMin: -1 }), b: row({ expiresInMin: -30 }) };
        assert.deepEqual(caption(venues, byId), {
            kind: 'live',
            updatedAt: NOW - MIN,
            source: '0 of 2 pins from SunStay microclimate, 2 from Open-Meteo weather',
        });
    });

    it('treats rows without expires_at as fresh', () => {
        const venues = [venue('a'), venue('b')];
        const byId = { a: row({ computedMinAgo: 9 }), b: row({ computedMinAgo: 4 }) };
        assert.deepEqual(caption(venues, byId), {
            kind: 'calculated',
            updatedAt: NOW - 9 * MIN,
            source: '2 of 2 pins from SunStay microclimate, 0 from Open-Meteo weather',
        });
    });

    it('uses the weather badge when profile pins are under half', () => {
        const venues = [venue('a'), venue('b'), venue('c')];
        const result = caption(venues, { a: row() }, { weatherKind: 'demo', weatherFetchedAt: null });
        assert.deepEqual(result, {
            kind: 'demo',
            updatedAt: null,
            source: '1 of 3 pins from SunStay microclimate, 2 from sample weather',
        });
    });

    it('counts rows without a readable time toward the share but not the age', () => {
        const venues = [venue('a'), venue('b')];
        assert.equal(caption(venues, { a: row({ computedMinAgo: 6 }), b: row({ computedMinAgo: null }) }).updatedAt, NOW - 6 * MIN);
        const noTimes = caption(venues, { a: row({ computedMinAgo: null }), b: row({ computedMinAgo: null }) });
        assert.equal(noTimes.kind, 'calculated');
        assert.equal(noTimes.updatedAt, null);
    });

    it('only counts pins inside the viewport', () => {
        const venues = [venue('a'), venue('off1', false), venue('off2', false)];
        const result = caption(venues, { a: row({ computedMinAgo: 2 }) });
        assert.equal(result.kind, 'calculated');
        assert.equal(result.source, '1 of 1 pins from SunStay microclimate, 0 from Open-Meteo weather');
    });

    it('skips venues the map rejects, such as swapped lat/lng, like their missing pins', () => {
        const swapped = { id: 'a', lat: 144.95, lng: -37.85 };
        assert.equal(caption([swapped], { a: row({ computedMinAgo: 2 }) }), null);
        const result = caption([swapped, venue('b')], { a: row(), b: row({ computedMinAgo: 2 }) });
        assert.equal(result.source, '1 of 1 pins from SunStay microclimate, 0 from Open-Meteo weather');
    });

    it('returns null with no pins on screen, no viewport, or loading weather and no profile majority', () => {
        assert.equal(caption([venue('off', false)], {}), null);
        assert.equal(mapCaptionProvenance({ venues: [venue('a')], bbox: null, microById: {}, now: NOW }), null);
        assert.equal(caption([venue('a'), venue('b')], {}, { weatherKind: null, weatherFetchedAt: null }), null);
    });
});
