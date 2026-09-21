import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chatWindKmh, chatWindLabel, hourlyWindGustsKmh, peekCardGustChip, toWindGustsKmh, toWindKmh } from './windUnits.js';

describe('wind unit boundary', () => {
    it('keeps Open-Meteo km/h gusts and does not multiply by 3.6', () => {
        assert.equal(toWindGustsKmh(50), 50);
        assert.equal(toWindKmh(19), 19);
        assert.notEqual(toWindGustsKmh(50), 50 * 3.6);
        assert.equal(
            hourlyWindGustsKmh({ wind_gusts_10m: [50, 40] }, 0),
            50
        );
    });

    it('converts genuine m/s inputs once', () => {
        assert.equal(toWindKmh(19 / 3.6, { from: 'ms' }), 19);
        assert.equal(toWindGustsKmh(10, { from: 'ms' }), 36);
        assert.equal(
            hourlyWindGustsKmh({ wind_gusts_10m: [10] }, 0, { from: 'ms' }),
            36
        );
    });

    it('reads either Open-Meteo gust spelling without a second conversion', () => {
        assert.equal(hourlyWindGustsKmh({ windgusts_10m: [12] }, 0), 12);
        assert.equal(hourlyWindGustsKmh({ wind_gusts_10m: [null, 18] }, 1), 18);
    });

    it('returns null for missing, zero is still a number, non-finite is null', () => {
        assert.equal(hourlyWindGustsKmh(null, 0), null);
        assert.equal(hourlyWindGustsKmh({}, 0), null);
        assert.equal(toWindGustsKmh(0), 0);
        assert.equal(toWindGustsKmh(null), null);
        assert.equal(toWindGustsKmh(undefined), null);
        assert.equal(toWindGustsKmh(NaN), null);
        assert.equal(hourlyWindGustsKmh({ wind_gusts_10m: [NaN] }, 0), null);
    });

    it('treats WeatherContext windGusts on the peek card as km/h', () => {
        const chip = peekCardGustChip({ windGusts: 50, wind: { speed: 50 / 3.6 } });
        assert.equal(chip.gustsKmh, 50);
        assert.equal(chip.visible, true);
        assert.equal(chip.label, '50km/h gusts');
        assert.notEqual(chip.gustsKmh, Math.round(50 * 3.6));

        const belowThreshold = peekCardGustChip({ windGusts: 12 });
        assert.equal(belowThreshold.gustsKmh, 12);
        assert.equal(belowThreshold.visible, false);

        const missing = peekCardGustChip({ windGusts: null });
        assert.equal(missing.visible, false);
        assert.equal(missing.gustsKmh, null);
    });

    it('formats ChatWidget wind as km/h from windKmh or a single m/s conversion', () => {
        assert.equal(Math.round(chatWindKmh({ current: { windSpeed: 5 } })), 18);
        assert.equal(chatWindLabel({ current: { windSpeed: 5 } }), '18 km/h');
        assert.equal(chatWindLabel({ wind: { speed: 5 } }), '18 km/h');
        assert.equal(chatWindKmh({ windKmh: 18, wind: { speed: 5 } }), 18);
        assert.equal(chatWindLabel({ windKmh: 18 }), '18 km/h');
        assert.equal(chatWindKmh({ current: { windKmh: 18, windSpeed: 5 } }), 18);
        assert.equal(chatWindKmh({ current: { windSpeed: 5 } }) > 30, false);
        assert.equal(chatWindKmh({ current: { windSpeed: 10 } }) > 30, true);
        assert.equal(chatWindKmh(null), null);
        assert.equal(chatWindKmh({}), null);
        assert.equal(chatWindKmh({ current: { windSpeed: NaN } }), null);
        assert.equal(chatWindKmh({ current: { windSpeed: Infinity } }), null);
        assert.equal(chatWindKmh({ windKmh: 'nope' }), null);
        assert.equal(chatWindLabel({}), null);
        assert.equal(chatWindLabel(null), null);
    });
});
