import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    HIDDEN_Y,
    MASCOT_INDICATOR_SLOT_PX,
    MASCOT_LAYER_Z,
    idlePullTransform,
    mascotPullSurface,
    pullTransformFromState,
    resolvePullTermination,
    schedulePullFrame,
} from './mascotPullTransform.js';
import { nextPullPhase } from './pullRefreshStatus.js';

describe('mascot pull transform ownership', () => {
    it('owns the pull with React state written to a DOM transform, not a Motion y value', () => {
        const pulling = pullTransformFromState({ phase: 'pulling', distance: 40, scale: 1.08 });
        assert.equal(pulling.owner, 'react-state-dom-style');
        assert.equal(pulling.translateY, HIDDEN_Y + 40);
        assert.equal(pulling.scale, 1.08);
        assert.equal(pulling.transform, `translate(-50%, ${HIDDEN_Y + 40}px) scale(1.08)`);
        assert.equal(pulling.cssVars['--ss-ptr-y'], `${HIDDEN_Y + 40}px`);
        assert.equal(pulling.cssVars['--ss-ptr-scale'], '1.08');
        assert.equal('y' in pulling, false);
    });

    it('resets the actual transform owner to the hidden idle style', () => {
        const idle = idlePullTransform();
        assert.equal(idle.owner, 'react-state-dom-style');
        assert.equal(idle.translateY, HIDDEN_Y);
        assert.equal(idle.scale, 1);
        assert.equal(idle.distance, 0);
        assert.equal(idle.transform, `translate(-50%, ${HIDDEN_Y}px) scale(1)`);
    });
});

describe('mascot pull containment surface', () => {
    it('clips the indicator in an overflow-hidden slot above the list', () => {
        const surface = mascotPullSurface();
        assert.equal(surface.indicator.overflow, 'hidden');
        assert.equal(surface.indicator.zIndex, MASCOT_LAYER_Z);
        assert.ok(surface.indicator.height >= MASCOT_INDICATOR_SLOT_PX);
        assert.equal(surface.list.overflow, 'hidden');
        assert.equal(surface.list.zIndex < surface.indicator.zIndex, true);
        assert.equal(surface.root.overflow, 'hidden');
    });
});

describe('pull gesture termination', () => {
    it('resets transform and phase on every non-error termination path', () => {
        const reasons = [
            'threshold-miss',
            'success',
            'touchcancel',
            'unmount',
            'venue-change',
            'sheet-close',
        ];
        for (const reason of reasons) {
            const result = resolvePullTermination(reason, {
                phase: 'pulling',
                distance: 36,
                scale: 1.1,
            });
            assert.equal(result.phase, 'idle', reason);
            assert.equal(result.resetTransform, true, reason);
            assert.deepEqual(result.transform, idlePullTransform(), reason);
        }
    });

    it('parks a failed refresh inside the indicator slot instead of over the list', () => {
        const result = resolvePullTermination('failure', {
            phase: 'refreshing',
            distance: 80,
            scale: 1.12,
        });
        assert.equal(result.phase, 'error');
        assert.equal(result.resetTransform, true);
        assert.equal(result.transform.owner, 'react-state-dom-style');
        assert.ok(result.transform.translateY >= HIDDEN_Y);
        assert.ok(result.transform.translateY <= 8);
        assert.ok(result.transform.distance < 80);
    });

    it('maps cancel/unmount/sheet-close/venue-change onto idle in the phase machine', () => {
        assert.equal(nextPullPhase('pulling', { type: 'cancel' }), 'idle');
        assert.equal(nextPullPhase('refreshing', { type: 'unmount' }), 'idle');
        assert.equal(nextPullPhase('success', { type: 'sheet-close' }), 'idle');
        assert.equal(nextPullPhase('error', { type: 'venue-change' }), 'idle');
        assert.equal(nextPullPhase('ready', { type: 'release', ready: false }), 'idle');
    });
});

describe('schedulePullFrame', () => {
    it('coalesces drag updates onto one animation frame', () => {
        const frames = [];
        const raf = (cb) => {
            frames.push(cb);
            return frames.length;
        };
        const applied = [];
        const scheduler = schedulePullFrame(raf, (payload) => applied.push(payload));
        scheduler.schedule({ distance: 10, scale: 1.02 });
        scheduler.schedule({ distance: 20, scale: 1.05 });
        assert.equal(frames.length, 1);
        assert.deepEqual(applied, []);
        frames[0]();
        assert.deepEqual(applied, [{ distance: 20, scale: 1.05 }]);
    });
});
