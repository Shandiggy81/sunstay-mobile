import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { venueDisplayScore } from './venueDisplayScore.js';
import { sortVenuesBySunstayScore } from './sortVenuesBySunstayScore.js';

const CURVE = [
    0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.8, 1.0, 1.0, 1.0,
    1.0, 0.9, 0.7, 0.3, 0, 0, 0, 0, 0, 0, 0, 0,
];
// Mid-September is AEST (UTC+10). 00:00 UTC is 10:00 Melbourne.
const AEST_DAY = new Date('2026-09-17T00:00:00Z');

const profile = (id, overrides = {}) => ({
    id,
    sun_now: 0,
    effective_sun: null,
    effective_wind: null,
    comfort_hint: null,
    geometry_confidence: 0.2,
    sun_hour_fraction: CURVE,
    ...overrides,
});

describe('venueDisplayScore', () => {
    it('prefers the cached microclimate score at the slider minute', () => {
        const byId = { a: profile('a') };
        const weatherScore = () => 12;
        assert.equal(venueDisplayScore({ id: 'a' }, {
            byId, todMinutes: 14 * 60, calculateSunstayScore: weatherScore, now: AEST_DAY,
        }), 70);
        assert.equal(venueDisplayScore({ id: 'a' }, {
            byId, todMinutes: 12 * 60, calculateSunstayScore: weatherScore, now: AEST_DAY,
        }), 100);
    });

    it('falls back to the rounded weather score when there is no profile', () => {
        assert.equal(venueDisplayScore({ id: 'b' }, {
            byId: { a: profile('a') }, todMinutes: 12 * 60, calculateSunstayScore: () => 63.6, now: AEST_DAY,
        }), 64);
    });

    it('keeps a zero profile reading instead of falling back', () => {
        assert.equal(venueDisplayScore({ id: 'a' }, {
            byId: { a: profile('a') }, todMinutes: 20 * 60, calculateSunstayScore: () => 90, now: AEST_DAY,
        }), 0);
    });

    it('matches numeric and string ids', () => {
        assert.equal(venueDisplayScore({ id: 7 }, {
            byId: { 7: profile('7') }, todMinutes: 12 * 60, now: AEST_DAY,
        }), 100);
    });

    it('returns null when neither score is known', () => {
        assert.equal(venueDisplayScore({ id: 'x' }, { calculateSunstayScore: () => null }), null);
        assert.equal(venueDisplayScore({ id: 'x' }), null);
        assert.equal(venueDisplayScore(null), null);
    });

    it('sorts the list in the same order as the badges it shows', () => {
        // Weather alone would put "low-profile" first (90 > 40), but its
        // profile badge reads 0 at 20:00, so it must sort below "no-profile".
        const venues = [{ id: 'no-profile' }, { id: 'low-profile' }, { id: 'high-profile' }];
        const weather = { 'no-profile': 40, 'low-profile': 90, 'high-profile': 10 };
        const options = {
            byId: {
                'low-profile': profile('low-profile'),
                'high-profile': profile('high-profile', { sun_hour_fraction: CURVE.map(() => 0.5) }),
            },
            todMinutes: 20 * 60,
            calculateSunstayScore: (v) => weather[v.id],
            now: AEST_DAY,
        };
        const scoreFn = (v) => venueDisplayScore(v, options);
        const sorted = sortVenuesBySunstayScore(venues, scoreFn);
        assert.deepEqual(sorted.map((v) => v.id), ['high-profile', 'no-profile', 'low-profile']);
        assert.deepEqual(sorted.map(scoreFn), [50, 40, 0]);
    });
});
