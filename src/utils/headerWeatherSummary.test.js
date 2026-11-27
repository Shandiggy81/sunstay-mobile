import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeCloud, describeWind, headerWeatherSummary, rainChancePercent } from './headerWeatherSummary.js';

const weather = {
    main: { temp: 21.6, humidity: 50 },
    weather: [{ main: 'Clear', description: 'sunny day' }],
    clouds: { all: 12 },
    precipProbability: 8,
};

describe('headerWeatherSummary', () => {
    it('collapses to one line: temperature, condition, comfort', () => {
        const s = headerWeatherSummary(weather, { windView: { speedKmh: 13, gustKmh: 12 }, comfort: { label: 'Comfortable' } });
        assert.equal(s.temperature, '22°');
        assert.equal(s.condition, 'Sunny day');
        assert.equal(s.comfort, 'Comfortable');
    });

    it('puts wind, rain and sky in plain words in the details', () => {
        const s = headerWeatherSummary(weather, { windView: { speedKmh: 13, gustKmh: 12 } });
        assert.deepEqual(s.details.map((d) => [d.label, d.value]), [
            ['Wind', 'Light breeze'],
            ['Rain', '8% chance'],
            ['Sky', 'Mostly clear'],
        ]);
        assert.equal(s.details[0].note, '13 km/h · gusts 12');
    });

    it('shows a loading line and no details before weather arrives', () => {
        const s = headerWeatherSummary(null);
        assert.equal(s.condition, 'Loading weather…');
        assert.deepEqual(s.details, []);
    });

    it('does not present the demo fallback as live weather', () => {
        const s = headerWeatherSummary({ ...weather, source: 'demo' }, { comfort: { label: 'Comfortable' } });
        assert.equal(s.condition, 'Live weather unavailable');
        assert.equal(s.temperature, '–');
        assert.deepEqual(s.details, []);
    });

    it('hides the comfort placeholder and missing numbers', () => {
        const s = headerWeatherSummary({ main: {}, weather: [] }, { comfort: { label: 'Loading' } });
        assert.equal(s.comfort, null);
        assert.equal(s.temperature, '–');
        assert.equal(s.details[0].value, '–');
        assert.equal(s.details[0].note, null);
    });
});

describe('plain-language weather words', () => {
    it('describes wind by speed', () => {
        assert.deepEqual([0, 5, 6, 19, 20, 35, 45, null].map(describeWind),
            ['Calm', 'Calm', 'Light breeze', 'Light breeze', 'Breezy', 'Windy', 'Very windy', null]);
    });

    it('describes cloud cover', () => {
        assert.deepEqual([0, 24, 25, 59, 60, null].map(describeCloud),
            ['Mostly clear', 'Mostly clear', 'Some cloud', 'Some cloud', 'Cloudy', null]);
    });

    it('prefers the reported rain chance and clamps it', () => {
        assert.equal(rainChancePercent({ precipProbability: 140 }), 100);
        assert.equal(rainChancePercent({ main: { humidity: 50 }, weather: [{ main: 'Rain' }] }), 55);
    });
});

describe('headerWeatherSummary follows the sky-now verdict', () => {
    // 27 Nov 2026, 3:30pm Melbourne (UTC+11); a reading taken in hour `index`.
    const NOW = new Date(Date.UTC(2026, 10, 27, 4, 30));
    const city = ({ reading = {}, slot = {}, index = 15 } = {}) => {
        const time = Array.from({ length: 24 }, (_, h) => `2026-11-27T${String(h).padStart(2, '0')}:00`);
        const s = { rain: 0, code: 3, cloud: 100, ...slot };
        return {
            source: 'open-meteo', main: { temp: 14 }, weather: [{ main: 'Clouds', description: 'overcast' }],
            clouds: { all: 100 }, precipitation: 0, precipProbability: 12, utcOffsetSeconds: 39600, ...reading,
            hourly: {
                time, precipitation_probability: time.map(() => s.rain), weather_code: time.map(() => s.code),
                cloud_cover: time.map(() => s.cloud), _tzOffsetSeconds: 39600, _currentIndex: index,
            },
        };
    };

    it('"Rain likely" instead of "Overcast" on a 95% hour, with that hour\'s chance in the details', () => {
        const s = headerWeatherSummary(city({ slot: { rain: 95 } }), { now: NOW });
        assert.equal(s.condition, 'Rain likely');
        assert.equal(s.details.find((d) => d.label === 'Rain').value, '95% chance');
    });

    it('rain in the reading keeps its own word, or says "Raining" for a non-rain code', () => {
        assert.equal(headerWeatherSummary(city({ reading: { precipitation: 1.2, weather: [{ main: 'Drizzle', description: 'drizzle' }] } }), { now: NOW }).condition, 'Drizzle');
        assert.equal(headerWeatherSummary(city({ reading: { precipitation: 0.3 } }), { now: NOW }).condition, 'Raining');
    });

    it('a reading from an earlier hour gives way to this hour\'s forecast code', () => {
        // Rain showers at 10am; the 3pm hour is forecast partly cloudy and dry.
        const stale = city({ index: 10, slot: { rain: 5, code: 2, cloud: 40 }, reading: { precipitation: 1.6, weather: [{ main: 'Rain', description: 'rain showers' }] } });
        assert.equal(headerWeatherSummary(stale, { now: NOW }).condition, 'Partly cloudy');
    });

    it('never names rain the verdict does not count (passing showers at a 20% chance)', () => {
        const passing = city({ index: 10, slot: { rain: 20, code: 80, cloud: 90 } });
        assert.equal(headerWeatherSummary(passing, { now: NOW }).condition, 'Cloudy');
    });

    it('says "Rain likely" after dark too', () => {
        const tenPm = new Date(Date.UTC(2026, 10, 27, 11));
        assert.equal(headerWeatherSummary(city({ index: 22, slot: { rain: 80 } }), { now: tenPm }).condition, 'Rain likely');
    });
});
