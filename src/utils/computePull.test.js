import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePull, PULL_MAX_DISTANCE, PULL_THRESHOLD, PULL_RESISTANCE, PULL_MAX_SCALE } from './computePull.js';

describe('computePull', () => {
    it('resists downward travel and stays at or under the 80px cap', () => {
        const pull = computePull(40);
        assert.equal(pull.distance, 40 * PULL_RESISTANCE);
        assert.ok(pull.distance < PULL_THRESHOLD);
        assert.equal(pull.ready, false);
        assert.ok(pull.scale > 1);
        assert.ok(pull.scale < PULL_MAX_SCALE);

        const maxed = computePull(400);
        assert.equal(maxed.distance, PULL_MAX_DISTANCE);
        assert.equal(maxed.scale, PULL_MAX_SCALE);
        assert.equal(maxed.ready, true);
    });

    it('is ready only once resisted distance reaches the 70px threshold', () => {
        const justUnder = computePull((PULL_THRESHOLD - 0.5) / PULL_RESISTANCE);
        assert.equal(justUnder.ready, false);

        const atThreshold = computePull(PULL_THRESHOLD / PULL_RESISTANCE);
        assert.equal(atThreshold.ready, true);
        assert.ok(atThreshold.distance >= PULL_THRESHOLD);
    });

    it('ignores upward or invalid deltas', () => {
        assert.deepEqual(computePull(-20), { distance: 0, scale: 1, ready: false });
        assert.deepEqual(computePull(undefined), { distance: 0, scale: 1, ready: false });
    });
});
