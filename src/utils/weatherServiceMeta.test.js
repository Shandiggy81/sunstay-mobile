import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    clearOpenMeteoWeatherCache,
    fetchOpenMeteoWeather,
    fetchOpenMeteoWeatherWithMeta,
    OPEN_METEO_CACHE_TTL_MS,
    readOpenMeteoCacheEntry,
    writeOpenMeteoCache,
} from './weatherService.js';
import { getBadgeState } from './dataBadgeState.js';

const LAT = -37.8136;
const LON = 144.9631;
const MINUTE_MS = 60_000;

const OPEN_METEO_RESPONSE = {
    utc_offset_seconds: 36000,
    current: {
        temperature_2m: 18, apparent_temperature: 17, relative_humidity_2m: 55,
        precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 200,
        wind_gusts_10m: 20, cloud_cover: 10, uv_index: 4, is_day: 1, shortwave_radiation: 500,
    },
    hourly: {
        time: ['2026-10-20T12:00'], temperature_2m: [18], apparent_temperature: [17],
        precipitation_probability: [0], weather_code: [0], cloud_cover: [10],
        wind_speed_10m: [10], wind_direction_10m: [200], wind_gusts_10m: [20],
        shortwave_radiation: [500], uv_index: [4], is_day: [1],
    },
    daily: { sunrise: ['2026-10-20T06:20'], sunset: ['2026-10-20T19:40'] },
};

describe('fetchOpenMeteoWeatherWithMeta', () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    beforeEach(() => {
        clearOpenMeteoWeatherCache();
        fetchCalls = 0;
        globalThis.fetch = async () => {
            fetchCalls += 1;
            return { ok: true, json: async () => OPEN_METEO_RESPONSE };
        };
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        clearOpenMeteoWeatherCache();
    });

    it('reports a fresh fetch as live, timestamped when it was fetched', async () => {
        const before = Date.now();
        const result = await fetchOpenMeteoWeatherWithMeta(LAT, LON, undefined, { timeoutMs: 1000 });

        assert.equal(fetchCalls, 1);
        assert.equal(result.kind, 'live');
        assert.ok(result.fetchedAt >= before && result.fetchedAt <= Date.now());
        assert.equal(result.data.source, 'open-meteo');
        assert.equal(readOpenMeteoCacheEntry(LAT, LON).timestamp, result.fetchedAt);
    });

    it('reports a cache hit as live with the original fetch time', async () => {
        const first = await fetchOpenMeteoWeatherWithMeta(LAT, LON, undefined, { timeoutMs: 1000 });
        const second = await fetchOpenMeteoWeatherWithMeta(LAT, LON, undefined, { timeoutMs: 1000 });

        assert.equal(fetchCalls, 1);
        assert.equal(second.kind, 'live');
        assert.equal(second.fetchedAt, first.fetchedAt);
        assert.equal(second.data, first.data);
    });

    it('lets DataBadge show an older cache hit as Cached with its real age', async () => {
        const fetchedAt = Date.now() - 20 * MINUTE_MS;
        writeOpenMeteoCache(LAT, LON, { source: 'open-meteo' }, fetchedAt);

        const result = await fetchOpenMeteoWeatherWithMeta(LAT, LON);
        const badge = getBadgeState({ kind: result.kind, updatedAt: result.fetchedAt, now: fetchedAt + 20 * MINUTE_MS });

        assert.equal(fetchCalls, 0);
        assert.deepEqual({ kind: result.kind, fetchedAt: result.fetchedAt }, { kind: 'live', fetchedAt });
        assert.equal(badge.label, 'Cached');
        assert.equal(badge.sublabel, 'Updated 20 min ago');
    });

    it('refetches once the cache entry is past its TTL', async () => {
        writeOpenMeteoCache(LAT, LON, { source: 'open-meteo' }, Date.now() - OPEN_METEO_CACHE_TTL_MS - 1);

        const result = await fetchOpenMeteoWeatherWithMeta(LAT, LON, undefined, { timeoutMs: 1000 });

        assert.equal(fetchCalls, 1);
        assert.ok(Date.now() - result.fetchedAt < MINUTE_MS);
    });

    it('keeps fetchOpenMeteoWeather returning the weather object only', async () => {
        const data = await fetchOpenMeteoWeather(LAT, LON, undefined, { timeoutMs: 1000 });

        assert.equal(data.source, 'open-meteo');
        assert.equal(data.kind, undefined);
        assert.equal(data.fetchedAt, undefined);
    });
});
