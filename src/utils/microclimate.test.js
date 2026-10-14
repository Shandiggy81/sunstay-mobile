import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SUN_CURVE_SLOTS,
    localHourForMinutes,
    melbourneHourNow,
    resolveSunFraction,
    hasSunProfile,
    formatSunPercent,
    describeSun,
    resolveWindExposure,
    resolveEffectiveWindMs,
    describeWindExposure,
    resolveComfortHint,
    formatReadingTime,
    boundsOfVenues,
    readMicroclimate,
    pinStateFromMicroclimate,
    markerScoreFromMicroclimate,
    formatSunHours,
    sunCurveTotals,
    lookupMicroclimateEntry,
    mergeMicroclimateRows,
} from './microclimate.js';

// 24 slots indexed by Australia/Melbourne wall-clock hour. Dawn at 06:00,
// plateau 09:00-12:00, fading out by 16:00 — the same local shape the
// Melbourne seed stores (no UTC rotation).
const LOCAL_CURVE = [
    0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.8, 1.0, 1.0, 1.0,
    1.0, 0.9, 0.7, 0.3, 0, 0, 0, 0, 0, 0, 0, 0,
];

const entry = (overrides = {}) => ({
    id: 'df-01',
    sun_now: 0,
    effective_sun: null,
    effective_wind: null,
    comfort_hint: null,
    geometry_confidence: 0.2,
    sun_hour_fraction: LOCAL_CURVE,
    ...overrides,
});

// Mid-September is AEST (UTC+10). 00:00 UTC is 10:00 Melbourne.
const AEST_DAY = new Date('2026-09-17T00:00:00Z');
// Mid-January is AEDT (UTC+11). 01:00 UTC is 12:00 Melbourne.
const AEDT_NOON = new Date('2026-01-15T01:00:00Z');

describe('localHourForMinutes', () => {
    it('indexes the curve by Melbourne wall-clock hour, not UTC', () => {
        assert.equal(localHourForMinutes(6 * 60), 6);
        assert.equal(localHourForMinutes(10 * 60), 10);
        assert.equal(localHourForMinutes(12 * 60), 12);
        assert.equal(localHourForMinutes(14 * 60 + 30), 14);
    });

    it('does not shift by the AEST or AEDT UTC offset', () => {
        // A UTC conversion of 12:00 Melbourne would land on hour 2 (AEST) or 1 (AEDT).
        assert.equal(localHourForMinutes(12 * 60, AEST_DAY), 12);
        assert.equal(localHourForMinutes(12 * 60, AEDT_NOON), 12);
        assert.notEqual(localHourForMinutes(12 * 60, AEST_DAY), 2);
        assert.notEqual(localHourForMinutes(12 * 60, AEDT_NOON), 1);
    });

    it('wraps past midnight rather than going negative or past 23', () => {
        assert.equal(localHourForMinutes(0), 0);
        assert.equal(localHourForMinutes(23 * 60 + 59), 23);
        assert.equal(localHourForMinutes(24 * 60), 0);
        assert.equal(localHourForMinutes(-60), 23);
    });

    it('returns null for a missing or unparseable value', () => {
        assert.equal(localHourForMinutes(null), null);
        assert.equal(localHourForMinutes(undefined), null);
        assert.equal(localHourForMinutes('not a time'), null);
    });
});

describe('melbourneHourNow', () => {
    it('reads the Australia/Melbourne wall-clock hour, including DST', () => {
        assert.equal(melbourneHourNow(AEST_DAY), 10);
        assert.equal(melbourneHourNow(AEDT_NOON), 12);
    });
});

describe('resolveSunFraction', () => {
    it('reads the curve at the Melbourne slider hour, not a UTC hour', () => {
        assert.equal(resolveSunFraction(entry(), 9 * 60, AEST_DAY), 1);
        assert.equal(resolveSunFraction(entry(), 12 * 60, AEST_DAY), 1);
        assert.equal(resolveSunFraction(entry(), 14 * 60, AEST_DAY), 0.7);
        assert.equal(resolveSunFraction(entry(), 18 * 60, AEST_DAY), 0);
    });

    it('yields a high midday Melbourne sun score on a clear-sky curve', () => {
        const atSix = resolveSunFraction(entry(), 6 * 60, AEST_DAY);
        const atNoon = resolveSunFraction(entry(), 12 * 60, AEST_DAY);
        const atEight = resolveSunFraction(entry(), 20 * 60, AEST_DAY);
        assert.ok(atSix > 0 && atSix < atNoon, 'dawn is lit but below midday');
        assert.ok(atNoon >= 0.9, 'midday Melbourne is high sun before clouds');
        assert.equal(atEight, 0, 'after dark');
    });

    it('keeps midday high during AEDT instead of looking up the UTC hour', () => {
        // Slot 1 (01:00 UTC) is night on a local curve. Slot 12 is noon.
        assert.equal(resolveSunFraction(entry(), 12 * 60, AEDT_NOON), 1);
    });

    it('falls back to sun_now when no minutes are supplied', () => {
        assert.equal(resolveSunFraction(entry({ sun_now: 0.42 }), null, AEST_DAY), 0.42);
    });

    it('prefers the live effective_sun only on the current Melbourne hour', () => {
        // AEST_DAY is 10:00 Melbourne.
        const live = entry({ effective_sun: 0.25 });
        assert.equal(resolveSunFraction(live, 10 * 60, AEST_DAY), 0.25, 'current hour uses the live reading');
        assert.equal(resolveSunFraction(live, 14 * 60, AEST_DAY), 0.7, 'other hours use the curve');
    });

    it('compares current hour in Melbourne, not UTC, during AEDT', () => {
        const live = entry({ effective_sun: 0.33 });
        assert.equal(resolveSunFraction(live, 12 * 60, AEDT_NOON), 0.33);
        assert.equal(resolveSunFraction(live, 9 * 60, AEDT_NOON), 1);
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
    // What enrich-microclimate writes: effective_wind = speed (m/s) x sector
    // multiplier, wind_shelter_score = 1 - multiplier x 0.9.
    const edgeRow = (speedMs, mult) => entry({
        effective_wind: speedMs * mult,
        wind_shelter_score: Math.min(1, Math.max(0, 1 - mult * 0.9)),
    });

    it('reads exposure as 1 - wind_shelter_score', () => {
        assert.equal(resolveWindExposure(entry({ wind_shelter_score: 0.45 })), 0.55);
        assert.equal(resolveWindExposure(entry({ wind_shelter_score: 1 })), 0);
        assert.equal(resolveWindExposure(entry({ wind_shelter_score: 0 })), 1);
    });

    it('does not read effective_wind (m/s) as exposure', () => {
        assert.equal(resolveWindExposure(entry({ effective_wind: 0.55 })), null);
        assert.equal(resolveWindExposure(entry({ effective_wind: 18 })), null);
    });

    it('rejects an out-of-range shelter score instead of guessing', () => {
        assert.equal(resolveWindExposure(entry({ wind_shelter_score: 1.4 })), null);
        assert.equal(resolveWindExposure(entry({ wind_shelter_score: -0.1 })), null);
    });

    it('returns null when absent', () => {
        assert.equal(resolveWindExposure(entry()), null);
        assert.equal(resolveWindExposure(null), null);
    });

    it('keeps effective_wind as metres per second', () => {
        assert.equal(resolveEffectiveWindMs(entry({ effective_wind: 6.3 })), 6.3);
        assert.equal(resolveEffectiveWindMs(entry({ effective_wind: 0 })), 0);
        assert.equal(resolveEffectiveWindMs(entry({ effective_wind: -1 })), null);
        assert.equal(resolveEffectiveWindMs(entry()), null);
        assert.equal(resolveEffectiveWindMs(null), null);
    });

    it('labels a typical edge-function row instead of dropping it', () => {
        // 7 m/s on an exposed corner: effective_wind 6.3, well over 1.
        const exposed = readMicroclimate(edgeRow(7, 0.9), 12 * 60, AEST_DAY);
        assert.equal(exposed.windSpeedMs, 6.3);
        assert.ok(Math.abs(exposed.windExposure - 0.81) < 1e-9);
        assert.equal(exposed.windLabel, 'Exposed');

        const laneway = readMicroclimate(edgeRow(7, 0.2), 12 * 60, AEST_DAY);
        assert.equal(laneway.windLabel, 'Sheltered');

        const still = readMicroclimate(edgeRow(1, 0.9), 12 * 60, AEST_DAY);
        assert.equal(still.windLabel, 'Calm');
    });

    it('bands exposure into plain language', () => {
        assert.equal(describeWindExposure(0.9), 'Exposed');
        assert.equal(describeWindExposure(0.5), 'Breezy');
        assert.equal(describeWindExposure(0.1), 'Sheltered');
        assert.equal(describeWindExposure(null), null);
    });

    it('says Calm when the wind at the venue is near still', () => {
        assert.equal(describeWindExposure(0.9, 0.8), 'Calm');
        assert.equal(describeWindExposure(0.9, 5), 'Exposed');
        assert.equal(describeWindExposure(null, 0.8), null);
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

    it('turns the server codes into plain words', () => {
        assert.equal(resolveComfortHint(entry({ comfort_hint: 'shaded_calm' })), 'Shaded and calm');
        assert.equal(resolveComfortHint(entry({ comfort_hint: 'sunny_breezy' })), 'Sunny but breezy');
        assert.equal(resolveComfortHint(entry({ comfort_hint: 'SUNNY_CALM' })), 'Sunny and calm');
        assert.equal(resolveComfortHint(entry({ comfort_hint: 'shaded_breezy' })), 'Shaded and breezy');
        assert.equal(resolveComfortHint(entry({ comfort_hint: 'warm_and_still' })), 'Warm and still');
    });
});

describe('mergeMicroclimateRows', () => {
    it('keeps rows from earlier viewports and replaces rows that come back', () => {
        const first = mergeMicroclimateRows({}, [{ id: 'a', effective_sun: 0.13 }, { id: 'b', effective_sun: 0.5 }]);
        const second = mergeMicroclimateRows(first, [{ id: 'b', effective_sun: 0.6 }, { id: 'c', effective_sun: 0.9 }]);
        assert.equal(second.a.effective_sun, 0.13, 'venue outside the new viewport keeps its row');
        assert.equal(second.b.effective_sun, 0.6);
        assert.equal(second.c.effective_sun, 0.9);
        assert.notEqual(second, first, 'returns a new object so React re-renders');
        assert.equal(first.b.effective_sun, 0.5, 'does not mutate the previous map');
    });

    it('returns the previous map for an empty or invalid response', () => {
        const prev = { a: { id: 'a' } };
        assert.equal(mergeMicroclimateRows(prev, []), prev);
        assert.equal(mergeMicroclimateRows(prev, null), prev);
        assert.equal(mergeMicroclimateRows(prev, [{ name: 'no id' }]), prev);
        assert.deepEqual({ ...mergeMicroclimateRows(null, [{ id: 7 }]) }, { 7: { id: 7 } });
    });

    it('scores a venue the same way after the viewport moves away from it', () => {
        const row = { id: 'v1', effective_sun: 0.13 };
        const zoomedOut = mergeMicroclimateRows({}, [row]);
        const zoomedIn = mergeMicroclimateRows(zoomedOut, [{ id: 'other', effective_sun: 0.8 }]);
        const score = (byId) => markerScoreFromMicroclimate(readMicroclimate(lookupMicroclimateEntry(byId, 'v1'), null));
        assert.equal(score(zoomedIn), score(zoomedOut));
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
            effective_wind: 3.2,
            wind_shelter_score: 0.45,
            comfort_hint: 'Pleasant, light breeze',
            effective_sun: 0.72,
        });
        const read = readMicroclimate(withWeather, 10 * 60, AEST_DAY);
        assert.equal(read.windExposure, 0.55);
        assert.equal(read.windSpeedMs, 3.2);
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

describe('pinStateFromMicroclimate', () => {
    it('returns null when there is no profile so markers can fall back', () => {
        assert.equal(pinStateFromMicroclimate(readMicroclimate(null, 12 * 60, AEST_DAY)), null);
        assert.equal(
            pinStateFromMicroclimate(readMicroclimate({ id: 'x', sun_now: null, sun_hour_fraction: null }, 12 * 60, AEST_DAY)),
            null,
        );
    });

    it('maps cached sun onto Mapbox pin keys without client weather recompute', () => {
        assert.equal(pinStateFromMicroclimate(readMicroclimate(entry(), 12 * 60, AEST_DAY)), 'sunshine');
        assert.equal(pinStateFromMicroclimate(readMicroclimate(entry(), 14 * 60, AEST_DAY)), 'sunny');
        assert.equal(pinStateFromMicroclimate(readMicroclimate(entry(), 15 * 60, AEST_DAY)), 'cloudy');
        assert.equal(pinStateFromMicroclimate(readMicroclimate(entry(), 20 * 60, AEST_DAY)), 'default');
    });

    it('uses cached wind for exposed pins when sun is not full', () => {
        const windy = entry({ effective_wind: 7.2, wind_shelter_score: 0.2, sun_hour_fraction: LOCAL_CURVE });
        assert.equal(pinStateFromMicroclimate(readMicroclimate(windy, 15 * 60, AEST_DAY)), 'windy');
        assert.equal(pinStateFromMicroclimate(readMicroclimate(windy, 12 * 60, AEST_DAY)), 'sunshine');
    });

    it('does not mark an exposed venue windy on a calm day', () => {
        const calm = entry({ effective_wind: 1.8, wind_shelter_score: 0.2, sun_hour_fraction: LOCAL_CURVE });
        assert.equal(pinStateFromMicroclimate(readMicroclimate(calm, 15 * 60, AEST_DAY)), 'cloudy');
    });
});

describe('markerScoreFromMicroclimate', () => {
    it('turns the cached sun fraction into a 0-100 pin badge', () => {
        assert.equal(markerScoreFromMicroclimate(readMicroclimate(entry(), 12 * 60, AEST_DAY)), 100);
        assert.equal(markerScoreFromMicroclimate(readMicroclimate(entry(), 14 * 60, AEST_DAY)), 70);
        assert.equal(markerScoreFromMicroclimate(readMicroclimate(null, 12 * 60, AEST_DAY)), null);
    });

    it('keeps a zero reading as 0 rather than falling through as missing', () => {
        assert.equal(markerScoreFromMicroclimate(readMicroclimate(entry(), 18 * 60, AEST_DAY)), 0);
    });
});

describe('formatSunHours', () => {
    it('formats numeric zero as 0h, never Oh', () => {
        assert.equal(formatSunHours(0), '0h');
        assert.equal(formatSunHours(0.0), '0h');
        assert.equal(formatSunHours(-0), '0h');
        assert.notEqual(formatSunHours(0), 'Oh');
        assert.equal(formatSunHours(0).startsWith('O'), false);
    });

    it('formats whole and fractional hours without a falsy fallback', () => {
        assert.equal(formatSunHours(6), '6h');
        assert.equal(formatSunHours(6.0, { digits: 1 }), '6.0h');
        assert.equal(formatSunHours(7.2, { digits: 1 }), '7.2h');
        assert.equal(formatSunHours(0, { digits: 1 }), '0.0h');
    });

    it('renders a dash when the value is missing rather than inventing a letter', () => {
        assert.equal(formatSunHours(null), '—');
        assert.equal(formatSunHours(undefined), '—');
        assert.equal(formatSunHours(Number.NaN), '—');
    });
});

describe('sunCurveTotals', () => {
    it('sums sun_hour_fraction slots as hours of sun and finds the peak window', () => {
        const totals = sunCurveTotals(LOCAL_CURVE);
        // Each of 24 slots is the fraction of that Melbourne-local hour in sun.
        // LOCAL_CURVE: 0.1+0.4+0.8+1+1+1+1+0.9+0.7+0.3 = 7.2h.
        assert.equal(totals.totalHours, 7.2);
        // Slots ≥ 0.5 run 08:00–15:00 (end exclusive of the first low slot).
        assert.equal(totals.peakWindow, '8am – 3pm');
        assert.equal(totals.peakStartHour, 8);
        assert.equal(totals.peakEndHour, 15);
    });

    it('reports 0 hours and no peak for an all-shade curve', () => {
        const totals = sunCurveTotals(Array(24).fill(0));
        assert.equal(totals.totalHours, 0);
        assert.equal(totals.peakWindow, null);
        assert.equal(formatSunHours(totals.totalHours), '0h');
        assert.notEqual(formatSunHours(totals.totalHours), 'Oh');
    });

    it('returns null totals when the curve is missing or the wrong length', () => {
        assert.equal(sunCurveTotals(null).totalHours, null);
        assert.equal(sunCurveTotals(undefined).peakWindow, null);
        assert.equal(sunCurveTotals([1, 0, 1]).totalHours, null);
        assert.equal(sunCurveTotals('not-an-array').totalHours, null);
    });
});

describe('lookupMicroclimateEntry', () => {
    it('resolves a venue id whether the map keyed it as a string or a number', () => {
        const byId = { '42': entry({ id: '42' }) };
        assert.equal(lookupMicroclimateEntry(byId, 42)?.id, '42');
        assert.equal(lookupMicroclimateEntry(byId, '42')?.id, '42');
        assert.equal(lookupMicroclimateEntry(byId, 'missing'), null);
        assert.equal(lookupMicroclimateEntry(null, 42), null);
    });
});
