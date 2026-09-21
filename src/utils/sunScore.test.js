import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLiveSunScore } from './sunScore.js';

const calmBase = {
    shortwaveRadiation: 0,
    apparentTemp: 22,
    precipProbability: 0,
    cloudCover: 0,
    isDay: 0,
};

describe('calculateLiveSunScore wind units', () => {
    it('treats windGusts as km/h, including 10 km/h which the old >10 heuristic converted', () => {
        const calm = calculateLiveSunScore({ ...calmBase, windGusts: 0 });
        const ten = calculateLiveSunScore({ ...calmBase, windGusts: 10 });
        const fifty = calculateLiveSunScore({ ...calmBase, windGusts: 50 });

        assert.equal(ten.breakdown.windPenalty, 0);
        assert.equal(ten.breakdown.windPenalty, calm.breakdown.windPenalty);
        assert.equal(fifty.breakdown.windPenalty, 3);
        assert.notEqual(ten.score, calculateLiveSunScore({ ...calmBase, windGusts: 10 * 3.6 }).score);
    });

    it('uses windGustsKmh when provided and converts windGustsMs once', () => {
        const named = calculateLiveSunScore({ ...calmBase, windGustsKmh: 50 });
        const fromMs = calculateLiveSunScore({ ...calmBase, windGustsMs: 50 / 3.6 });
        assert.equal(named.breakdown.windPenalty, 3);
        assert.equal(fromMs.breakdown.windPenalty, 3);
    });

    it('ignores missing, null, zero, and non-finite gusts instead of inventing a conversion', () => {
        for (const windGusts of [undefined, null, 0, NaN, Infinity, 'windy']) {
            const view = calculateLiveSunScore({ ...calmBase, windGusts });
            assert.equal(view.breakdown.windPenalty, 0);
        }
    });
});
