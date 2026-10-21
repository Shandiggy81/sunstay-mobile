import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tonightFeel } from './tonightFeel.js';

const NOW = new Date('2026-10-19T00:00:00Z'); // 11am Melbourne, AEDT
const TIMES = Array.from({ length: 24 }, (_, hour) => `2026-10-19T${String(hour).padStart(2, '0')}:00`);
const payload = (feels = 20, rain = 10, wind = 10) => ({ source: 'open-meteo', hourly: {
    time: [...TIMES], apparent_temperature: TIMES.map(() => feels),
    precipitation_probability: TIMES.map(() => rain), wind_speed_10m: TIMES.map(() => wind),
} });
const view = (weather = payload(), venue = {}, now = NOW) => tonightFeel({ weather, venue, now });

test('warm evening requires every remaining hour to be at least 18°, below 40% rain and below 30km/h', () => {
    const result = view(payload(18, 39, 29.9));
    assert.equal(result.verdict, 'Warm enough to sit outside');
    assert.equal(result.icon, 'night');
    const weather = payload();
    weather.hourly.apparent_temperature[21] = 17.9;
    assert.equal(view(weather).verdict, 'Jacket weather outside');
});

test('jacket verdict covers 12 to below 18 without rounding across a boundary', () => {
    for (const temperature of [12, 12.1, 17, 17.9]) {
        const result = view(payload(temperature));
        assert.equal(result.verdict, 'Jacket weather outside');
        assert.equal(result.icon, 'jacket');
        assert.match(result.detail, new RegExp(`Feels ${temperature}°`));
    }
    assert.equal(view(payload(11.9)).verdict, 'Best inside tonight');
});

test('cold, rain and wind each select the inside verdict with its reason icon', () => {
    for (const [feels, rain, wind, icon] of [[11, 0, 0, 'indoor-warmth'], [20, 50, 0, 'rain'],
        [20, 0, 30, 'windsock'], [20, 50, 30, 'rain']]) {
        const result = view(payload(feels, rain, wind));
        assert.equal(result.verdict, 'Best inside tonight');
        assert.equal(result.icon, icon);
    }
    const weather = payload();
    weather.hourly.wind_speed_10m[23] = 30;
    assert.equal(view(weather).icon, 'windsock', 'the 11pm endpoint remains part of the forecast window');
});

test('40–49% rain keeps a cautious jacket verdict and the explicit rain chance', () => {
    for (const chance of [40, 49, 49.9]) {
        const result = view(payload(20, chance));
        assert.equal(result.verdict, 'Jacket weather outside');
        assert.ok(result.detail.includes(`${chance}% chance of rain`));
    }
});

test('detail reports the actual coldest hour, peak wind and rain only at 30% or above', () => {
    const weather = payload();
    weather.hourly.apparent_temperature[21] = 11;
    weather.hourly.wind_speed_10m[18] = 25;
    weather.hourly.precipitation_probability[22] = 30;
    assert.equal(view(weather).detail, 'Feels 11° by 9pm · breezy · 30% chance of rain');
    weather.hourly.precipitation_probability[22] = 29.9;
    assert.equal(view(weather).detail, 'Feels 11° by 9pm · breezy');
});

test('warmth uses explicit venue offerings and heating, with no live status claim', () => {
    assert.deepEqual(view(payload(), { heating: 'electric-fireplace', tags: ['Heaters', 'Indoor Warmth', 'Fireplace'] }).warmth, [
        { icon: 'fireplace', text: 'Fireplace inside' },
        { icon: 'heater', text: 'Has outdoor heaters' },
        { icon: 'indoor-warmth', text: 'Warm indoor space' },
    ]);
    assert.deepEqual(view(payload(), { heating: 'heated outdoor' }).warmth,
        [{ icon: 'heater', text: 'Has outdoor heaters' }]);
    assert.deepEqual(view(payload(), { heating: 'indoor heating' }).warmth,
        [{ icon: 'indoor-warmth', text: 'Warm indoor space' }]);
    assert.deepEqual(view(payload(), { tags: ['Cozy', 'Indoor only'], heating: 'no fireplace', fireplaceOn: true, heatersOn: true }).warmth, []);
    assert.deepEqual(view(payload(), { heating: 'no heating' }).warmth, []);
    assert.deepEqual(view(payload(), null).warmth, []);
});

test('missing, malformed, demo and unavailable forecasts produce no section', () => {
    for (const weather of [null, {}, { hourly: { time: 'not an array' } },
        { ...payload(), source: 'demo' }, { ...payload(), unavailable: true }, { ...payload(), error: true }]) {
        assert.equal(view(weather), null);
    }
    assert.equal(tonightFeel({ weather: payload(), now: new Date(NaN) }), null);
    assert.equal(tonightFeel({ weather: payload() }), null);
    assert.equal(tonightFeel(), null);
});

test('missing required companion data or an evening hour hides instead of assuming safe conditions', () => {
    for (const key of ['apparent_temperature', 'precipitation_probability', 'wind_speed_10m']) {
        for (const missing of [null, undefined, NaN, '', '   ', false, []]) {
            const weather = payload();
            weather.hourly[key][20] = missing;
            assert.equal(view(weather), null, `${key}=${missing}`);
        }
        const weather = payload();
        delete weather.hourly[key];
        assert.equal(view(weather), null);
        weather.hourly[key] = '1'.repeat(24);
        assert.equal(view(weather), null);
    }
    for (const [field, value] of [['precipitation_probability', -1], ['precipitation_probability', 101], ['wind_speed_10m', -1]]) {
        const weather = payload();
        weather.hourly[field][20] = value;
        assert.equal(view(weather), null);
    }
    const weather = payload();
    weather.hourly.time[22] = 'invalid';
    assert.equal(view(weather), null);
});

test('tonight is Melbourne today, excludes other dates, and ignores a scrubbed preview', () => {
    const weather = payload();
    weather.hourly.time = weather.hourly.time.map(time => time.replace('2026-10-19', '2026-10-20'));
    assert.equal(view(weather), null);
    const input = { weather: payload(), venue: {}, now: NOW };
    assert.deepEqual(tonightFeel({ ...input, previewMinutes: 360, todMinutes: 1200 }), tonightFeel(input));
    const before = process.env.TZ;
    try {
        process.env.TZ = 'America/Los_Angeles';
        assert.equal(view().verdict, 'Warm enough to sit outside');
    } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
    }
});

test('remaining evening excludes elapsed hours and labels the current forecast hour now', () => {
    const weather = payload();
    weather.hourly.apparent_temperature[17] = 5;
    weather.hourly.apparent_temperature[21] = 13;
    weather.hourly.apparent_temperature[22] = 16;
    const result = view(weather, {}, new Date('2026-10-19T10:30:00Z')); // 9:30pm Melbourne
    assert.equal(result.verdict, 'Jacket weather outside');
    assert.equal(result.detail, 'Feels 13° now · light wind');
    weather.hourly.apparent_temperature[17] = null;
    assert.ok(view(weather, {}, new Date('2026-10-19T10:30:00Z')), 'past missing samples are not required');
});

test('section hides at 11pm and later, even when later forecast data exists', () => {
    assert.ok(view(payload(), {}, new Date('2026-10-19T11:59:59Z'))); // 10:59:59pm Melbourne
    assert.equal(view(payload(), {}, new Date('2026-10-19T12:00:00Z')), null); // 11pm
    assert.equal(view(payload(), {}, new Date('2026-10-19T12:59:00Z')), null);
});

test('Melbourne evening stays local across the October DST change and accepts absolute timestamps', () => {
    for (const [day, now] of [['2026-10-03', '2026-10-03T01:00:00Z'], ['2026-10-04', '2026-10-04T00:00:00Z']]) {
        const weather = payload();
        weather.hourly.time = weather.hourly.time.map(time => time.replace('2026-10-19', day));
        assert.equal(view(weather, {}, new Date(now)).verdict, 'Warm enough to sit outside');
    }
    const weather = payload();
    weather.hourly.time = weather.hourly.time.map(time => `${time}:00+11:00`);
    assert.equal(view(weather).verdict, 'Warm enough to sit outside');
});

test('does not mutate forecast arrays or venue facts', () => {
    const weather = payload(), venue = { heating: 'fireplace', tags: ['Heaters'] };
    const before = JSON.stringify({ weather, venue });
    view(weather, venue);
    assert.equal(JSON.stringify({ weather, venue }), before);
});
