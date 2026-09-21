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

    it('omits gust copy when gusts are missing, null, or zero', () => {
        assert.equal(presentWind({ windKmh: 13 }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: null }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: 0 }).gustLabel, null);
        assert.equal(presentWind({ windKmh: 13, windGusts: 0 }).gustKmh, null);
        assert.equal(presentWind(null).speedLabel, null);
    });

    it('shows Gusts only when a positive gust value exists', () => {
        const view = presentWind({ windKmh: 13, windGusts: 35.2 });
        assert.equal(view.gustKmh, 35);
        assert.equal(view.gustLabel, 'Gusts: 35 km/h');
        assert.equal(view.speedLabel, '13 km/h');
    });
});
