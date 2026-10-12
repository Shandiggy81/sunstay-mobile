import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canvasOutOfSync } from './mapMarkerLifecycle.js';

describe('canvasOutOfSync', () => {
    it('flags a canvas left shorter than its box (iOS toolbar collapse)', () => {
        assert.equal(canvasOutOfSync({ width: 388, height: 668 }, { width: 388, height: 407 }), true);
    });

    it('ignores matching sizes and sub-pixel rounding', () => {
        assert.equal(canvasOutOfSync({ width: 388, height: 668 }, { width: 388, height: 668 }), false);
        assert.equal(canvasOutOfSync({ width: 388.4, height: 667.6 }, { width: 388, height: 668 }), false);
    });

    it('flags a width change too', () => {
        assert.equal(canvasOutOfSync({ width: 430, height: 668 }, { width: 388, height: 668 }), true);
    });

    it('does nothing for a hidden or missing map', () => {
        assert.equal(canvasOutOfSync({ width: 0, height: 0 }, { width: 388, height: 668 }), false);
        assert.equal(canvasOutOfSync(null, { width: 388, height: 668 }), false);
        assert.equal(canvasOutOfSync({ width: 388, height: 668 }, undefined), false);
    });
});
