import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBeginPull } from './shouldBeginPull.js';

describe('shouldBeginPull', () => {
    const down = { sheetExpanded: true, scrollTop: 0, deltaX: 2, deltaY: 16 };

    it('starts a pull only when the sheet is expanded, the list is at the top, and movement is downward-vertical', () => {
        assert.equal(shouldBeginPull(down), true);
    });

    it('preserves the sheet gesture when the sheet is not expanded', () => {
        assert.equal(shouldBeginPull({ ...down, sheetExpanded: false }), false);
    });

    it('preserves list scrolling when scrollTop is not zero', () => {
        assert.equal(shouldBeginPull({ ...down, scrollTop: 12 }), false);
    });

    it('rejects horizontal-first or upward movement', () => {
        assert.equal(shouldBeginPull({ ...down, deltaX: 20, deltaY: 8 }), false);
        assert.equal(shouldBeginPull({ ...down, deltaY: 0 }), false);
        assert.equal(shouldBeginPull({ ...down, deltaY: -10 }), false);
    });
});
