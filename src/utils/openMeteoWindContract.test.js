import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOpenMeteoWeather } from './weatherService.js';
import { presentWind } from './presentWind.js';
import { chatWindKmh, chatWindLabel } from './windUnits.js';

describe('Open-Meteo wind unit contract', () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';

    before(() => {
        globalThis.fetch = async (url) => {
            capturedUrl = String(url);
            return {
                ok: true,
                json: async () => ({
                    utc_offset_seconds: 36000,
                    current: {
                        temperature_2m: 14,
                        apparent_temperature: 12,
                        relative_humidity_2m: 62,
                        precipitation: 0,
                        weather_code: 0,
                        wind_speed_10m: 19,
                        wind_gusts_10m: 50,
                        cloud_cover: 10,
                        uv_index: 3,
                        is_day: 1,
                        shortwave_radiation: 400,
                    },
                    hourly: {
                        time: ['2026-09-21T12:00'],
                        temperature_2m: [14],
                        apparent_temperature: [12],
                        precipitation_probability: [0],
                        weather_code: [0],
                        cloud_cover: [10],
                        wind_speed_10m: [19],
                        wind_gusts_10m: [50],
                        shortwave_radiation: [400],
                        uv_index: [3],
                        is_day: [1],
                    },
                    daily: {
                        sunrise: ['2026-09-21T06:12'],
                        sunset: ['2026-09-21T18:22'],
                    },
                }),
            };
        };
    });

    after(() => {
        globalThis.fetch = originalFetch;
    });

    it('requests km/h and stores speed/gusts without a second conversion', async () => {
        const weather = await fetchOpenMeteoWeather(-12.3456, 130.9876, undefined, { timeoutMs: 1000 });
        const request = new URL(capturedUrl);

        assert.equal(request.searchParams.get('wind_speed_unit'), 'kmh');
        assert.equal(weather.windKmh, 19);
        assert.equal(weather.windGusts, 50);
        assert.notEqual(weather.windKmh, 19 * 3.6);
        assert.notEqual(weather.windGusts, 50 * 3.6);

        const view = presentWind(weather);
        assert.equal(view.speedLabel, '19 km/h');
        assert.equal(view.gustLabel, 'Gusts: 50 km/h');

        assert.equal(weather.wind.speed, 19 / 3.6);
        assert.equal(chatWindKmh(weather), 19);
        assert.equal(chatWindLabel(weather), '19 km/h');
        assert.equal(
            chatWindLabel({ current: { windSpeed: weather.wind.speed, windKmh: weather.windKmh } }),
            '19 km/h'
        );
        assert.equal(
            chatWindLabel({ current: { windSpeed: weather.wind.speed } }),
            '19 km/h'
        );
    });

    it('requests km/h from HourlyForecastStrip and never asks for m/s in production callers', () => {
        const strip = readFileSync(new URL('../components/HourlyForecastStrip.jsx', import.meta.url), 'utf8');
        const service = readFileSync(new URL('./weatherService.js', import.meta.url), 'utf8');
        const weatherApi = readFileSync(new URL('./weatherApi.js', import.meta.url), 'utf8');

        assert.match(strip, /wind_speed_unit:\s*'kmh'/);
        assert.match(service, /wind_speed_unit:\s*'kmh'/);
        assert.doesNotMatch(strip, /windSpeedUnit:\s*'ms'/);
        assert.doesNotMatch(service, /windSpeedUnit:\s*'ms'/);
        assert.doesNotMatch(weatherApi, /wind_speed_10m|wind_gusts_10m|wind_speed_unit/);
    });
});
