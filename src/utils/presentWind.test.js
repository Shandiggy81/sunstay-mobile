import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presentWind } from './presentWind.js';

describe('presentWind', () => {
    it('converts OpenWeather-shaped m/s wind.speed into rounded km/h', () => {
        const view = presentWind({ wind: { speed: 3.61 } });
        assert.equal(view.speedKmh, 13);
        assert.equal(view.speedLabel, '13 km/h');
    });

    it('prefers native Open-Meteo windKmh over converting wind.speed', () => {
        const view = presentWind({ windKmh: 18.4, wind: { speed: 3.61 } });
        assert.equal(view.speedKmh, 18);
        assert.equal(view.speedLabel, '18 km/h');
    });

    it('does not multiply values that are already km/h', () => {
        const view = presentWind({ windKmh: 19, windGusts: 50, wind: { speed: 19 / 3.6 } });
        assert.equal(view.speedKmh, 19);
        assert.equal(view.speedLabel, '19 km/h');
        assert.equal(view.gustKmh, 50);
        assert.equal(view.gustLabel, 'Gusts: 50 km/h');
        assert.notEqual(view.speedKmh, Math.round(19 * 3.6));
        assert.notEqual(view.gustKmh, Math.round(50 * 3.6));
    });

    it('formats base 19 and gust 50 from Open-Meteo km/h fields', () => {
        const view = presentWind({ windKmh: 19, windGusts: 50 });
        assert.equal(view.speedLabel, '19 km/h');
        assert.equal(view.gustLabel, 'Gusts: 50 km/h');
    });

    it('omits gust copy when gusts are missing, null, undefined, or zero', () => {
        assert.equal(presentWind({ windKmh: 13 }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: null }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: undefined }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: 0 }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: 0 }).gustKmh, null);
        assert.equal(presentWind(null).speedLabel, null);
    });

    it('shows a finite positive gust even when it is lower than or equal to base speed', () => {
        const lower = presentWind({ windKmh: 19, windGusts: 12 });
        assert.equal(lower.speedLabel, '19 km/h');
        assert.equal(lower.gustLabel, 'Gusts: 12 km/h');

        const equal = presentWind({ windKmh: 19, windGusts: 19 });
        assert.equal(equal.gustLabel, 'Gusts: 19 km/h');
    });

    it('shows Gusts only when a positive gust value exists', () => {
        const view = presentWind({ windKmh: 13, windGusts: 35.2 });
        assert.equal(view.gustKmh, 35);
        assert.equal(view.gustLabel, 'Gusts: 35 km/h');
        assert.equal(view.speedLabel, '13 km/h');
    });

    it('does not emit malformed labels for non-finite gusts', () => {
        assert.equal(presentWind({ windKmh: 19, windGusts: NaN }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 19, windGusts: Infinity }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 19, windGusts: -Infinity }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 19, windGusts: 'gusty' }).gustLabel, null);
        const view = presentWind({ windKmh: 19, windGusts: NaN });
        assert.equal(view.speedLabel, '19 km/h');
        assert.doesNotMatch(String(view.gustLabel), /NaN|Infinity/);
    });

    it('falls back safely when base speed is missing or malformed', () => {
        assert.equal(presentWind({ windKmh: 'nope' }).speedLabel, null);
        assert.equal(presentWind({ windKmh: NaN }).speedLabel, null);
        assert.equal(presentWind({ windKmh: Infinity }).speedLabel, null);
        assert.equal(presentWind({ wind: { speed: 'fast' } }).speedLabel, null);
        assert.equal(presentWind({}).speedLabel, null);
        assert.equal(presentWind(undefined).speedLabel, null);
        const view = presentWind({ windKmh: 'nope', windGusts: 50 });
        assert.equal(view.speedLabel, null);
        assert.equal(view.gustLabel, 'Gusts: 50 km/h');
        assert.doesNotMatch(String(view.speedLabel), /NaN|undefined|km\/h km\/h/);
    });
});
