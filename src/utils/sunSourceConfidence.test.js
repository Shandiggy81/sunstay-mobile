import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_CONFIDENCE_THRESHOLDS, sunSourceConfidence } from './sunSourceConfidence.js';

const HORIZON = Array.from({ length: 36 }, (_, i) => (i % 3) * 7.5);
const line = (geometryConfidence, dataSource = 'clue') => sunSourceConfidence({ horizon: HORIZON, geometryConfidence, dataSource });

describe('sunSourceConfidence', () => {
    it('keeps its thresholds in one place', () => {
        assert.deepEqual({ ...SUN_CONFIDENCE_THRESHOLDS }, { calculated: 0.5, high: 0.8 });
        assert.ok(Object.isFrozen(SUN_CONFIDENCE_THRESHOLDS));
    });

    it('reads High for a CLUE venue with mostly measured buildings', () => {
        assert.deepEqual(line(0.92), {
            kind: 'calculated',
            basis: 'Calculated from City of Melbourne buildings',
            confidence: 'high',
            confidenceLabel: 'High confidence',
            line: 'Calculated from City of Melbourne buildings · High confidence',
        });
        assert.equal(line(0.8).confidence, 'high');
    });

    it('reads Medium between the thresholds', () => {
        assert.equal(line(0.79).line, 'Calculated from City of Melbourne buildings · Medium confidence');
        assert.equal(line(0.5).kind, 'calculated');
        assert.equal(line(0.5).confidence, 'medium');
    });

    it('calls mostly default heights an estimate, always Low', () => {
        assert.deepEqual(line(0.49), {
            kind: 'estimated',
            basis: 'Estimated from mapped buildings',
            confidence: 'low',
            confidenceLabel: 'Low confidence',
            line: 'Estimated from mapped buildings · Low confidence',
        });
        for (const unusable of [null, undefined, Number.NaN, '0.9', -0.1, 1.2, Infinity]) {
            assert.equal(line(unusable).kind, 'estimated');
            assert.equal(line(unusable).confidence, 'low');
        }
    });

    it('caps hand-entered venue locations at Medium and does not name the City of Melbourne', () => {
        for (const dataSource of [null, undefined, 'other']) {
            const result = sunSourceConfidence({ horizon: HORIZON, geometryConfidence: 0.95, dataSource });
            assert.equal(result.confidence, 'medium');
            assert.equal(result.line, 'Calculated from mapped buildings · Medium confidence');
        }
    });

    it('never reads High next to an estimate, whatever the inputs', () => {
        for (let score = -0.2; score <= 1.2; score += 0.01) {
            for (const dataSource of ['clue', null]) {
                const result = line(score, dataSource);
                if (result.kind === 'estimated') {
                    assert.equal(result.confidence, 'low');
                    assert.doesNotMatch(result.line, /High|Very good/);
                }
                if (result.confidence === 'high') assert.equal(result.kind, 'calculated');
            }
        }
    });

    it('has no line without a usable horizon, because there are no sun windows', () => {
        for (const horizon of [null, undefined, [], HORIZON.slice(1), [...HORIZON.slice(1), null], [...HORIZON.slice(1), 'x']]) {
            assert.equal(sunSourceConfidence({ horizon, geometryConfidence: 0.9, dataSource: 'clue' }), null);
        }
        assert.equal(sunSourceConfidence(), null);
    });
});
