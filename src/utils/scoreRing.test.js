import test from 'node:test';
import assert from 'node:assert/strict';
import { clampScore, scoreBand, scoreRingBackground, scoreRingTone, SCORE_RING_TRACK } from './scoreRing.js';

test('the ring fills to the score out of 100', () => {
    assert.equal(scoreRingBackground(64, { size: 40, stroke: 4 }),
        `radial-gradient(closest-side, #ffffff 80%, transparent 81%), conic-gradient(#fbbf24 64%, ${SCORE_RING_TRACK} 0)`);
    assert.match(scoreRingBackground(130), /conic-gradient\(#f59e0b 100%/);
    assert.match(scoreRingBackground(-5), /conic-gradient\(#94a3b8 0%/);
    assert.match(scoreRingBackground(null), /conic-gradient\(#cbd5e1 0%/);
    assert.match(scoreRingBackground(80, { size: 28, stroke: 3, inner: '#FFE7A3' }), /^radial-gradient\(closest-side, #FFE7A3 78\.6%, transparent 79\.6%\)/);
});

test('tones and words follow the pin thresholds', () => {
    assert.deepEqual([90, 75, 74, 50, 49, 0].map(n => scoreRingTone(n).fill), ['#f59e0b', '#f59e0b', '#fbbf24', '#fbbf24', '#94a3b8', '#94a3b8']);
    assert.deepEqual([90, 60, 30, 5, 0, null].map(scoreBand), ['Great sun', 'Good sun', 'Some sun', 'Little sun', 'No direct sun', null]);
    assert.equal(clampScore(63.6), 64);
    assert.equal(clampScore(NaN), null);
});
