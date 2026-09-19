// Lives under src/utils/ so it is picked up by the `npm test` glob, which
// covers src/utils/*.test.js and src/hooks/*.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateApparentTemp,
    getComfortZone,
    getWindProfile,
    getWindWarning,
    getWindTrend,
    generateHourlyForecast,
    getOptimalBookingTime,
} from '../data/windIntelligence.js';

const VENUE = { id: 'dv-02', venueName: 'The Emerson Rooftop', vibe: 'rooftop bar', tags: ['rooftop'] };

test('getComfortZone reports Unknown for absent readings', () => {
    for (const input of [null, undefined, '', NaN, 'n/a', {}]) {
        const zone = getComfortZone(input);
        assert.equal(zone.level, 'unknown', `expected unknown for ${String(input)}`);
        assert.equal(zone.label, 'Unknown');
    }
});

test('getComfortZone never reports Extreme Heat for NaN', () => {
    // NaN fails every `<` comparison, so it used to fall through to the final
    // "Extreme Heat" branch and advise indoor seating on missing data.
    assert.notEqual(getComfortZone(NaN).level, 'extreme');
});

test('getComfortZone still classifies real temperatures', () => {
    assert.equal(getComfortZone(5).level, 'cold');
    assert.equal(getComfortZone(13).level, 'cool');
    assert.equal(getComfortZone(19).level, 'mild');
    assert.equal(getComfortZone(25).level, 'warm');
    assert.equal(getComfortZone(30).level, 'hot');
    assert.equal(getComfortZone(40).level, 'extreme');
    assert.equal(getComfortZone(0).level, 'cold', '0 °C is a real reading, not a missing one');
});

test('getComfortZone always returns a fully populated shape', () => {
    for (const input of [null, NaN, 5, 25, 40]) {
        const zone = getComfortZone(input);
        for (const key of ['level', 'label', 'advice', 'color', 'bgColor', 'borderColor', 'icon']) {
            assert.ok(zone[key], `${key} missing for ${String(input)}`);
        }
    }
});

test('calculateApparentTemp returns null rather than NaN for absent inputs', () => {
    assert.equal(calculateApparentTemp(null, 5, 50, 0), null);
    assert.equal(calculateApparentTemp(20, null, 50, 0), null);
    assert.equal(calculateApparentTemp(undefined, undefined, undefined, 0), null);
    assert.equal(calculateApparentTemp('warm', 5, 50, 0), null);
    assert.equal(calculateApparentTemp(NaN, 5, 50, 0), null);
});

test('calculateApparentTemp treats 0 as a real reading', () => {
    assert.ok(Number.isFinite(calculateApparentTemp(0, 0, 50, 0)));
});

test('calculateApparentTemp defaults unusable humidity to 50%', () => {
    const baseline = calculateApparentTemp(20, 3, 50, 0.2);
    assert.equal(calculateApparentTemp(20, 3, null, 0.2), baseline);
    assert.equal(calculateApparentTemp(20, 3, 'high', 0.2), baseline);
});

test('getWindProfile and getWindWarning survive a missing venue', () => {
    for (const venue of [undefined, null, {}]) {
        const profile = getWindProfile(venue);
        assert.ok(Number.isFinite(profile.exposure));
        assert.ok(Number.isFinite(profile.shelterFactor));
        const warning = getWindWarning(undefined, venue);
        for (const key of ['level', 'label', 'advice', 'color', 'bgColor', 'borderColor', 'icon']) {
            assert.ok(warning[key], `${key} missing`);
        }
        assert.ok(Number.isFinite(warning.effectiveWind));
    }
});

test('generateHourlyForecast yields 24 renderable rows even with no weather', () => {
    const rows = generateHourlyForecast(undefined, undefined, undefined, VENUE);
    assert.equal(rows.length, 24);
    for (const row of rows) {
        assert.ok(Number.isFinite(row.temp), 'temp must be finite');
        assert.ok(Number.isFinite(row.feelsLike), 'feelsLike must be finite');
        assert.ok(Number.isFinite(row.wind), 'wind must be finite');
        assert.ok(row.comfort?.icon, 'comfort must be populated');
        assert.ok(row.windWarning?.level, 'windWarning must be populated');
        assert.ok(row.label, 'label must be populated');
    }
});

test('getWindTrend and getOptimalBookingTime tolerate empty forecasts', () => {
    for (const input of [undefined, null, []]) {
        assert.equal(getWindTrend(input).direction, 'steady');
        assert.equal(getOptimalBookingTime(input), null);
    }
});
