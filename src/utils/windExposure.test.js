import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWindExposure, describeWindExposure } from './windExposure.js';
import { getVenueWindExposure, getWindProfile, getWindWarning, calculateApparentTemp, generateHourlyForecast } from '../data/windIntelligence.js';

const profile = { sectors: [{ from: 330, to: 30, factor: 1.6, note: 'Northerly laneway tunnel' }], defaultFactor: 0.6 };
const venue = { vibe: 'Rooftop', windProfile: profile };
const exposure = direction => calculateWindExposure({ windMs: 10, gustMs: 15, direction, windProfile: profile, fallbackFactor: 0.95 });

test('wind sectors cross north and use meteorological FROM bearings including endpoints', () => {
    for (const direction of [330, 350, 0, 20, 30, 360]) assert.equal(exposure(direction).factor, 1.6);
    for (const direction of [31, 180, 329]) assert.equal(exposure(direction).factor, 0.6);
    assert.equal(exposure(180).note, null);assert.equal(exposure(0).note, 'Northerly laneway tunnel');
});
test('wind tunnels amplify sustained wind and gusts above 1.0', () => {
    assert.equal(exposure(0).effectiveWindMs, 16);assert.equal(exposure(0).effectiveGustMs, 24);
    assert.equal(exposure(0).tunnel, true);assert.equal(exposure(180).tunnel, false);
});
test('configured wind factors clamp to 0–2.5, including defaults', () => {
    for (const [factor, expected] of [[4, 2.5], [-2, 0]]) {
        const result = calculateWindExposure({ windMs: 10, direction: 0, windProfile: { sectors: [{ from: 0, to: 360, factor }] } });
        assert.equal(result.factor, expected);assert.equal(result.effectiveWindMs, 10 * expected);
        assert.equal(calculateWindExposure({ windMs: 10, direction: 90, windProfile: { defaultFactor: factor } }).factor, expected);
    }
});
test('no profile preserves each existing exposure and warning, even if direction and gusts are provided', () => {
    for (const vibe of ['Rooftop', 'Courtyard', 'Outdoor Streetside', 'Cafe', 'Beer garden']) {
        const old = { vibe };
        assert.equal(getVenueWindExposure(10, old, 0, 20).effectiveWindMs, 10 * getWindProfile(old).exposure);
        assert.deepEqual(getWindWarning(10, old, 0, 20), getWindWarning(10, old));
    }
});
test('missing or invalid direction falls back to the legacy venue exposure, not the custom default', () => {
    for (const direction of [null, undefined, NaN, 'bad', -1, 361]) {
        const result = getVenueWindExposure(10, venue, direction, 20);
        assert.equal(result.factor, getWindProfile(venue).exposure);
        assert.equal(result.directional, false);assert.equal(result.tunnel, false);
        assert.equal(result.effectiveGustMs, 20 * getWindProfile(venue).exposure);
    }
});
test('missing wind and gusts remain null; calm zero is real; malformed sectors are ignored', () => {
    const result = calculateWindExposure({ windMs: null, gustMs: NaN, direction: 0, windProfile: profile });
    assert.equal(result.effectiveWindMs, null);assert.equal(result.effectiveGustMs, null);
    assert.equal(describeWindExposure(result), 'Wind estimate unavailable');
    assert.equal(calculateWindExposure({ windMs: 0, gustMs: 0, direction: 0, windProfile: profile }).effectiveGustMs, 0);
    assert.equal(calculateWindExposure({ windMs: 10, direction: 0, windProfile: { sectors: [null, { from: 330 }], defaultFactor: 0.4 } }).factor, 0.4);
});
test('plain-English verdicts identify shelter and directional gust amplification', () => {
    const result = calculateWindExposure({ windMs: 8, gustMs: 10, direction: 0, windProfile: { defaultFactor: 1.25 } });
    assert.equal(describeWindExposure(result, '2–5pm'), 'Wind tunnel warning 2–5pm: northerly gusts feel like 45 km/h here');
    assert.equal(describeWindExposure(exposure(180)), 'Sheltered today — southerly breeze');
});
test('directional gusts drive warnings while sustained wind drives apparent temperature', () => {
    const warning = getWindWarning(5, venue, 0, 10);
    assert.equal(warning.level, 'red');assert.equal(warning.effectiveWind, 29);assert.equal(warning.effectiveGust, 58);
    const apparent = calculateApparentTemp(20, 5, 50, 0.05, 0, 10, venue);
    assert.equal(apparent, calculateApparentTemp(20, 8, 50, 0));
    assert.equal(calculateApparentTemp(20, 5, 50, 0.05, null, 10, venue), calculateApparentTemp(20, 5, 50, 0.05));
});
test('profiled hourly forecasts consume each real direction/gust and keep timestamps venue-local', () => {
    const rows = generateHourlyForecast(20, 5, 50, venue, 0, 10, {
        now: new Date('2026-10-14T04:30Z'), utcOffsetSeconds: 39600,
        hourly: { time: ['2026-10-14T15:00', '2026-10-14T16:00'], temperature_2m: [20, 21],
            wind_speed_10m: [18, 36], wind_direction_10m: [0, 180], wind_gusts_10m: [36, 54] },
    });
    assert.equal(rows[0].time.toISOString(), '2026-10-14T04:00:00.000Z');
    assert.equal(rows[0].windExposure.effectiveWindMs, 8);
    assert.equal(rows[0].windExposure.effectiveGustMs, 16);
    assert.equal(rows[1].windExposure.factor, 0.6);assert.equal(rows[1].windExposure.effectiveGustMs, 9);
    assert.equal(rows[2].windDirection, null);assert.equal(rows[2].gustMs, null);
    assert.equal(rows[2].windExposure.directional, false);
});

test('missing temperature slots do not shift a later direction into the current hour', () => {
    const rows = generateHourlyForecast(20, 5, 50, venue, 0, 10, {
        now: new Date('2026-10-14T04:30Z'), utcOffsetSeconds: 39600,
        hourly: { time: ['2026-10-14T15:00', '2026-10-14T16:00'], temperature_2m: [null, 21],
            wind_speed_10m: [18, 36], wind_direction_10m: [0, 180], wind_gusts_10m: [36, 54] },
    });
    assert.equal(rows[0].hour, 15);assert.equal(rows[0].windDirection, null);
    assert.equal(rows[1].hour, 16);assert.equal(rows[1].windDirection, 180);
});
