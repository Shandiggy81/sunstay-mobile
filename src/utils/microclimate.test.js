import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SUN_CURVE_SLOTS,
    utcHourForMinutes,
    resolveSunFraction,
    hasSunProfile,
    formatSunPercent,
    describeSun,
    resolveWindExposure,
    describeWindExposure,
    resolveComfortHint,
    formatReadingTime,
    boundsOfVenues,
    readMicroclimate,
} from './microclimate.js';

// The curve the Melbourne seed writes: UTC-indexed, so the daylight run sits
// at slots 20-23 and 0-5, which is 06:00-15:00 Melbourne.
const SEEDED_CURVE = [
    1, 1, 1, 0.9, 0.7, 0.3, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.8, 1,
];

const entry = (overrides = {}) => ({
    id: 'df-01',
    sun_now: 0,
    effective_sun: null,
    effective_wind: null,
    comfort_hint: null,
    geometry_confidence: 0.2,
    sun_hour_fraction: SEEDED_CURVE,
    ...overrides,
});

// Mid-September is AEST, so Melbourne is UTC+10.
const AEST_DAY = new Date('2026-09-17T00:00:00Z');

describe('utcHourForMinutes', () => {
    it('shifts Melbourne wall-clock minutes back by the AEST offset', () => {
        assert.equal(utcHourForMinutes(10 * 60, AEST_DAY), 0);
        assert.equal(utcHourForMinutes(12 * 60, AEST_DAY), 2);
        assert.equal(utcHourForMinutes(6 * 60, AEST_DAY), 20);
    });

    it('wraps across the UTC day boundary rather than going negative', () => {
        assert.equal(utcHourForMinutes(9 * 60, AEST_DAY), 23);
        assert.equal(utcHourForMinutes(8 * 60, AEST_DAY), 22);
    });

    it('returns null for a missing or unparseable value', () => {
        assert.equal(utcHourForMinutes(null, AEST_DAY), null);
        assert.equal(utcHourForMinutes(undefined, AEST_DAY), null);
        assert.equal(utcHourForMinutes('not a time', AEST_DAY), null);
    });
});

describe('resolveSunFraction', () => {
    it('reads the curve at the slider hour, not the current hour', () => {
        // 09:00 Melbourne -> UTC 23 -> slot 23 -> 1
        assert.equal(resolveSunFraction(entry(), 9 * 60, AEST_DAY), 1);
        // 14:00 Melbourne -> UTC 4 -> slot 4 -> 0.7
        assert.equal(resolveSunFraction(entry(), 14 * 60, AEST_DAY), 0.7);
        // 18:00 Melbourne -> UTC 8 -> slot 8 -> 0
        assert.equal(resolveSunFraction(entry(), 18 * 60, AEST_DAY), 0);
    });

    it('produces a daylight shape across the whole slider range', () => {
        const atSix = resolveSunFraction(entry(), 6 * 60, AEST_DAY);
        const atNoon = resolveSunFraction(entry(), 12 * 60, AEST_DAY);
        const atEight = resolveSunFraction(entry(), 20 * 60, AEST_DAY);
        assert.ok(atSix > 0 && atSix < atNoon, 'dawn is lit but below midday');
        assert.equal(atNoon, 1);
        assert.equal(atEight, 0, 'after dark');
    });

    it('falls back to sun_now when no minutes are supplied', () => {
        assert.equal(resolveSunFraction(entry({ sun_now: 0.42 }), null, AEST_DAY), 0.42);
    });

    it('prefers the live effective_sun only on the current hour', () => {
        // AEST_DAY is 00:00 UTC, which is 10:00 Melbourne.
        const live = entry({ effective_sun: 0.25 });
        assert.equal(resolveSunFraction(live, 10 * 60, AEST_DAY), 0.25, 'current hour uses the live reading');
        assert.equal(resolveSunFraction(live, 14 * 60, AEST_DAY), 0.7, 'other hours use the curve');
    });

    it('clamps values that fall outside 0-1', () => {
        assert.equal(resolveSunFraction(entry({ sun_hour_fraction: null, sun_now: 4 }), null, AEST_DAY), 1);
        assert.equal(resolveSunFraction(entry({ sun_hour_fraction: null, sun_now: -2 }), null, AEST_DAY), 0);
    });

    it('returns null for a venue with no profile at all', () => {
        assert.equal(resolveSunFraction(null, 12 * 60, AEST_DAY), null);
        assert.equal(
            resolveSunFraction(entry({ sun_hour_fraction: null, sun_now: null }), 12 * 60, AEST_DAY),
            null,
        );
    });

    it('ignores a curve that is not 24 slots and uses sun_now instead', () => {
        const short = entry({ sun_hour_fraction: [1, 0, 1], sun_now: 0.5 });
        assert.equal(resolveSunFraction(short, 12 * 60, AEST_DAY), 0.5);
    });
});

describe('hasSunProfile', () => {
    it('accepts a full curve or a bare sun_now', () => {
        assert.equal(hasSunProfile(entry()), true);
        assert.equal(hasSunProfile(entry({ sun_hour_fraction: null, sun_now: 0 })), true);
    });

    it('rejects an empty or absent profile', () => {
        assert.equal(hasSunProfile(null), false);
        assert.equal(hasSunProfile(entry({ sun_hour_fraction: null, sun_now: null })), false);
    });

    it('expects exactly 24 slots', () => {
        assert.equal(SUN_CURVE_SLOTS, 24);
        assert.equal(hasSunProfile(entry({ sun_hour_fraction: [1, 1], sun_now: null })), false);
    });
});

describe('formatSunPercent and describeSun', () => {
    it('renders a rounded percentage', () => {
        assert.equal(formatSunPercent(1), '100%');
        assert.equal(formatSunPercent(0.755), '76%');
        assert.equal(formatSunPercent(0), '0%');
    });

    it('renders a dash rather than NaN when unknown', () => {
        assert.equal(formatSunPercent(null), '—');
        assert.equal(formatSunPercent(undefined), '—');
    });

    it('bands the fraction into plain language', () => {
        assert.equal(describeSun(1), 'Full sun');
        assert.equal(describeSun(0.5), 'Partial sun');
        assert.equal(describeSun(0.1), 'Mostly shaded');
        assert.equal(describeSun(0), 'In shade');
        assert.equal(describeSun(null), null);
    });
});

describe('wind exposure', () => {
    it('accepts a normalised 0-1 reading', () => {
        assert.equal(resolveWindExposure(entry({ effective_wind: 0.55 })), 0.55);
        assert.equal(resolveWindExposure(entry({ effective_wind: 0 })), 0);
    });

    it('rejects out-of-range values instead of guessing the unit', () => {
        assert.equal(resolveWindExposure(entry({ effective_wind: 18 })), null);
        assert.equal(resolveWindExposure(entry({ effective_wind: -1 })), null);
    });

    it('returns null when absent', () => {
        assert.equal(resolveWindExposure(entry()), null);
        assert.equal(resolveWindExposure(null), null);
    });

    it('bands exposure into plain language', () => {
        assert.equal(describeWindExposure(0.9), 'Exposed');
        assert.equal(describeWindExposure(0.5), 'Breezy');
        assert.equal(describeWindExposure(0.1), 'Sheltered');
        assert.equal(describeWindExposure(null), null);
    });
});

describe('resolveComfortHint', () => {
    it('passes through a trimmed hint', () => {
        assert.equal(resolveComfortHint(entry({ comfort_hint: '  Pleasant, light breeze ' })), 'Pleasant, light breeze');
    });

    it('treats blank and non-string values as absent', () => {
        assert.equal(resolveComfortHint(entry({ comfort_hint: '   ' })), null);
        assert.equal(resolveComfortHint(entry({ comfort_hint: null })), null);
        assert.equal(resolveComfortHint(entry({ comfort_hint: 42 })), null);
        assert.equal(resolveComfortHint(null), null);
    });
});

describe('formatReadingTime', () => {
    it('renders slider minutes as a 12-hour clock', () => {
        assert.equal(formatReadingTime(6 * 60), '6:00 AM');
        assert.equal(formatReadingTime(12 * 60), '12:00 PM');
        assert.equal(formatReadingTime(14 * 60 + 30), '2:30 PM');
        assert.equal(formatReadingTime(20 * 60), '8:00 PM');
    });

    it('renders midnight as 12 AM rather than 0 AM', () => {
        assert.equal(formatReadingTime(0), '12:00 AM');
    });

    it('says "now" when the slider has not been touched', () => {
        assert.equal(formatReadingTime(null), 'now');
        assert.equal(formatReadingTime(undefined), 'now');
    });
});

describe('boundsOfVenues', () => {
    it('covers every venue supplied', () => {
        const bbox = boundsOfVenues([
            { lat: -37.7730, lng: 144.9268 },
            { lat: -37.8677, lng: 144.9788 },
            { lat: -37.8059, lng: 144.8934 },
        ]);
        assert.ok(bbox.minLat <= -37.8677);
        assert.ok(bbox.maxLat >= -37.7730);
        assert.ok(bbox.minLng <= 144.8934);
        assert.ok(bbox.maxLng >= 144.9788);
    });

    it('pads a single venue so the box has area', () => {
        const bbox = boundsOfVenues([{ lat: -37.8136, lng: 144.9631 }]);
        assert.ok(bbox.maxLat > bbox.minLat, 'latitude span is non-zero');
        assert.ok(bbox.maxLng > bbox.minLng, 'longitude span is non-zero');
        assert.ok(bbox.minLat < -37.8136 && bbox.maxLat > -37.8136, 'venue sits inside');
    });

    it('skips rows with unusable coordinates', () => {
        const bbox = boundsOfVenues([
            { lat: -37.81, lng: 144.96 },
            { lat: null, lng: 144.96 },
            { lat: 'x', lng: 'y' },
            { lat: 999, lng: 999 },
        ]);
        assert.ok(bbox.minLat < -37.8 && bbox.maxLat > -37.82);
        assert.ok(bbox.maxLat < 90, 'the out-of-range row did not widen the box');
    });

    it('returns null when there is nothing usable', () => {
        assert.equal(boundsOfVenues([]), null);
        assert.equal(boundsOfVenues(null), null);
        assert.equal(boundsOfVenues(undefined), null);
        assert.equal(boundsOfVenues([{ lat: null, lng: null }]), null);
    });
});

describe('readMicroclimate', () => {
    it('collapses a seeded row into display values for the slider hour', () => {
        const read = readMicroclimate(entry(), 12 * 60, AEST_DAY);
        assert.equal(read.available, true);
        assert.equal(read.sunFraction, 1);
        assert.equal(read.sunPercent, '100%');
        assert.equal(read.sunLabel, 'Full sun');
        assert.equal(read.isLiveSun, false);
        assert.equal(read.confidence, 0.2);
    });

    it('tracks the slider rather than staying fixed', () => {
        const morning = readMicroclimate(entry(), 9 * 60, AEST_DAY);
        const afternoon = readMicroclimate(entry(), 15 * 60, AEST_DAY);
        const evening = readMicroclimate(entry(), 19 * 60, AEST_DAY);
        assert.equal(morning.sunPercent, '100%');
        assert.equal(afternoon.sunPercent, '30%');
        assert.equal(evening.sunPercent, '0%');
    });

    it('surfaces wind and comfort when the weather refresh has run', () => {
        const withWeather = entry({
            effective_wind: 0.55,
            comfort_hint: 'Pleasant, light breeze',
            effective_sun: 0.72,
        });
        const read = readMicroclimate(withWeather, 10 * 60, AEST_DAY);
        assert.equal(read.windExposure, 0.55);
        assert.equal(read.windLabel, 'Breezy');
        assert.equal(read.comfortHint, 'Pleasant, light breeze');
        assert.equal(read.sunFraction, 0.72);
        assert.equal(read.isLiveSun, true);
    });

    it('reports unavailable for a venue with no profile row', () => {
        const bare = { id: 'df-99', sun_now: null, sun_hour_fraction: null };
        const read = readMicroclimate(bare, 12 * 60, AEST_DAY);
        assert.equal(read.available, false);
        assert.equal(read.sunPercent, '—');
        assert.equal(read.sunLabel, null);
        assert.equal(read.windLabel, null);
        assert.equal(read.comfortHint, null);
    });

    it('does not throw on a null entry', () => {
        const read = readMicroclimate(null, 12 * 60, AEST_DAY);
        assert.equal(read.available, false);
        assert.equal(read.sunFraction, null);
    });
});
