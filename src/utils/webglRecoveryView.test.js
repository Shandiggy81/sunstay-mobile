import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { webglRecoveryView } from './webglRecoveryView.js';

describe('webgl recovery overlay', () => {
    it('mounts a blocking paused overlay while the context is lost', () => {
        const view = webglRecoveryView(true);
        assert.equal(view.mounted, true);
        assert.equal(view.blocksInteraction, true);
        assert.equal(view.message, 'Map paused');
        assert.equal(view.role, 'status');
        assert.equal(view.hasSpinner, false);
        assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(view.message), false);
        assert.match(view.surfaceClass, /amber/);
        assert.match(view.surfaceClass, /slate/);
    });

    it('unmounts the overlay when webglcontextrestored resets lost state', () => {
        const lost = webglRecoveryView(true);
        const restored = webglRecoveryView(false);
        assert.equal(lost.mounted, true);
        assert.equal(restored.mounted, false);
        assert.equal(restored.blocksInteraction, false);
        assert.equal(restored.node, null);
    });
});
