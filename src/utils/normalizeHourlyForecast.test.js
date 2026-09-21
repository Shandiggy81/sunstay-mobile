import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHourlyForecast, countDirectSunHours } from './normalizeHourlyForecast.js';

const NOW = new Date('2026-03-01T09:00:00Z');

/** Build an Open-Meteo-shaped payload with `count` hours from NOW. */
function payload(count, series = {}) {
    const time = Array.from({ length: count }, (_, i) =>
        new Date(NOW.getTime() + i * 3600_000).toISOString()
    );
    return {
        hourly: {
            time,
            temperature_2m: time.map((_, i) => 18 + i),
            ...series,
        },
    };
}

test('normalizeHourlyForecast maps a healthy payload', () => {
    const rows = normalizeHourlyForecast(payload(3), { now: NOW });
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.temp), [18, 19, 20]);
    assert.ok(rows[0].time instanceof Date);
});

test('normalizeHourlyForecast returns [] for missing or malformed payloads', () => {
    for (const input of [undefined, null, {}, { hourly: {} }, { hourly: { time: null } }]) {
        assert.deepEqual(normalizeHourlyForecast(input, { now: NOW }), []);
    }
});

test('normalizeHourlyForecast returns [] when hourly.time is truthy but not an array', () => {
    // This shape passed the old `!data?.hourly?.time` guard and threw on `.map`.
    const rows = normalizeHourlyForecast({ hourly: { time: '2026-03-01T09:00' } }, { now: NOW });
    assert.deepEqual(rows, []);
});

test('normalizeHourlyForecast survives a missing temperature series', () => {
    // Indexing an absent series used to throw a TypeError and discard the forecast.
    const data = payload(3);
    delete data.hourly.temperature_2m;
    assert.deepEqual(normalizeHourlyForecast(data, { now: NOW }), []);
});

test('normalizeHourlyForecast drops rows without a finite temperature', () => {
    const data = payload(4);
    data.hourly.temperature_2m = [18, null, 'n/a', 21];
    const rows = normalizeHourlyForecast(data, { now: NOW });
    assert.deepEqual(rows.map(r => r.temp), [18, 21]);
    assert.ok(rows.every(r => Number.isFinite(r.temp)), 'no NaN reaches the UI');
});

test('normalizeHourlyForecast tolerates companion series shorter than time', () => {
    const rows = normalizeHourlyForecast(
        payload(3, { apparent_temperature: [17], precipitation_probability: [40] }),
        { now: NOW }
    );
    assert.equal(rows.length, 3);
    assert.equal(rows[0].feelsLike, 17);
    // Missing entries fall back to the temperature / neutral defaults, not NaN.
    assert.equal(rows[1].feelsLike, 19);
    assert.equal(rows[1].precip, 0);
    assert.ok(rows.every(r => Number.isFinite(r.feelsLike) && Number.isFinite(r.precip)));
});

test('normalizeHourlyForecast accepts both Open-Meteo field spellings', () => {
    const legacy = normalizeHourlyForecast(
        payload(1, { weathercode: [61], cloudcover: [80], windgusts_10m: [10] }),
        { now: NOW }
    );
    assert.equal(legacy[0].code, 61);
    assert.equal(legacy[0].clouds, 80);
    assert.equal(legacy[0].gusts, 10);

    const current = normalizeHourlyForecast(
        payload(1, { weather_code: [3], cloud_cover: [50] }),
        { now: NOW }
    );
    assert.equal(current[0].code, 3);
    assert.equal(current[0].clouds, 50);
});

test('normalizeHourlyForecast keeps Open-Meteo km/h gusts without a second conversion', () => {
    const rows = normalizeHourlyForecast(
        payload(1, { wind_gusts_10m: [50] }),
        { now: NOW }
    );
    assert.equal(rows[0].gusts, 50);
    assert.notEqual(rows[0].gusts, Math.round(50 * 3.6));
});

test('normalizeHourlyForecast converts genuine m/s gusts only when asked', () => {
    const rows = normalizeHourlyForecast(
        payload(1, { wind_gusts_10m: [10] }),
        { now: NOW, windSpeedUnit: 'ms' }
    );
    assert.equal(rows[0].gusts, 36);
});

test('normalizeHourlyForecast treats missing, zero, and non-finite gusts as 0', () => {
    assert.equal(normalizeHourlyForecast(payload(1), { now: NOW })[0].gusts, 0);
    assert.equal(normalizeHourlyForecast(payload(1, { wind_gusts_10m: [0] }), { now: NOW })[0].gusts, 0);
    assert.equal(normalizeHourlyForecast(payload(1, { wind_gusts_10m: [null] }), { now: NOW })[0].gusts, 0);
    assert.equal(normalizeHourlyForecast(payload(1, { wind_gusts_10m: [NaN] }), { now: NOW })[0].gusts, 0);
});

test('normalizeHourlyForecast skips invalid timestamps and past hours', () => {
    const data = payload(3);
    data.hourly.time[1] = 'not-a-date';
    const rows = normalizeHourlyForecast(data, { now: new Date(NOW.getTime() + 3600_000) });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].temp, 20);
});

test('normalizeHourlyForecast honours the limit', () => {
    assert.equal(normalizeHourlyForecast(payload(40), { now: NOW, limit: 12 }).length, 12);
});

test('countDirectSunHours counts only bright, clear hours', () => {
    const data = payload(4, {
        direct_normal_irradiance: [0, 500, 600, 300],
        cloud_cover: [10, 10, 90, 20],
    });
    assert.equal(countDirectSunHours(data, 4), 2);
});

test('countDirectSunHours returns null when irradiance is unavailable', () => {
    assert.equal(countDirectSunHours(payload(3), 24), null);
    assert.equal(countDirectSunHours(undefined, 24), null);
});
