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
        assert.equal(dragging.className, 'ss-mobile-sheet--will-change ss-mobile-sheet--backdrop-off');

        const idle = sheetDragCompositing({ dragging: false });
        assert.equal(idle.willChange, 'auto');
        assert.equal(idle.backdropFilter, 'blur(20px)');
        assert.equal(idle.className, '');
        assert.notEqual(idle.willChange, 'transform');
    });

    it('can turn will-change and backdrop-filter off independently, then clean up', () => {
        const noPromote = sheetDragCompositing({
            dragging: true,
            willChange: 'off',
            backdrop: 'none-while-dragging',
        });
        assert.equal(noPromote.willChange, 'auto');
        assert.equal(noPromote.backdropFilter, 'none');
        assert.equal(noPromote.inlineTransform, null);
        assert.equal(noPromote.className, 'ss-mobile-sheet--backdrop-off');

        const keepBlur = sheetDragCompositing({
            dragging: true,
            willChange: 'while-dragging',
            backdrop: 'always',
        });
        assert.equal(keepBlur.willChange, 'transform');
        assert.equal(keepBlur.backdropFilter, 'blur(20px)');
        assert.equal(keepBlur.className, 'ss-mobile-sheet--will-change');

        const released = sheetDragCompositing({
            dragging: false,
            willChange: 'while-dragging',
            backdrop: 'none-while-dragging',
        });
        assert.equal(released.willChange, 'auto');
        assert.equal(released.backdropFilter, 'blur(20px)');
        assert.equal(released.className, '');
    });
});
