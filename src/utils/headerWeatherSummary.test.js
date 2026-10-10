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
