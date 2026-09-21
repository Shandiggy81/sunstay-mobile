import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sheetDragCompositing } from './sheetDragCompositing.js';

describe('sheet drag compositing', () => {
    it('keeps Framer Motion as the transform owner and does not set a competing inline transform', () => {
        const view = sheetDragCompositing({ dragging: true });
        assert.equal(view.transformOwner, 'framer-motion-y');
        assert.equal(view.inlineTransform, null);
        assert.equal(view.transformOrigin, 'bottom');
    });

    it('applies will-change and disables backdrop-filter only while dragging, then cleans up', () => {
        const dragging = sheetDragCompositing({ dragging: true });
        assert.equal(dragging.willChange, 'transform');
        assert.equal(dragging.backdropFilter, 'none');
        assert.equal(dragging.className, 'ss-mobile-sheet--dragging');

        const idle = sheetDragCompositing({ dragging: false });
        assert.equal(idle.willChange, 'auto');
        assert.equal(idle.backdropFilter, 'blur(20px)');
        assert.equal(idle.className, '');
        assert.notEqual(idle.willChange, 'transform');
    });
});
