import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { idlePullTransform } from './mascotPullTransform.js';
import {
    VENUE_REFRESH_TIMEOUT_STATUS,
    pullRefreshStatus,
} from './pullRefreshStatus.js';
import {
    actorOpacityForPhase,
    applyMascotTermination,
    pointerLossEffect,
    settleRefreshResult,
} from './mascotRefreshLifecycle.js';

function pullingState(overrides = {}) {
    return {
        phase: 'pulling',
        distance: 40,
        scale: 1.1,
        generation: 2,
        showMascot: true,
        timedOut: false,
        ...overrides,
    };
}

describe('mascot refresh settlement', () => {
    it('parks a resolved refresh on success with full opacity', () => {
        const settled = settleRefreshResult(pullingState({ phase: 'refreshing', generation: 4 }), 4, {
            ok: true,
            rows: [],
        });
        assert.equal(settled.ignored, false);
        assert.equal(settled.outcome, 'success');
        assert.equal(settled.phase, 'success');
        assert.equal(settled.opacity, 1);
        assert.equal(settled.hold, true);
        assert.equal(settled.releasePointer, true);
        assert.equal(settled.transform.owner, 'react-state-dom-style');
    });

    it('parks a rejected refresh on the error transform and keeps retry status', () => {
        const settled = settleRefreshResult(pullingState({ phase: 'refreshing', generation: 4 }), 4, {
            ok: false,
            error: new Error('nope'),
        });
        assert.equal(settled.outcome, 'failure');
        assert.equal(settled.phase, 'error');
        assert.equal(settled.timedOut, false);
        assert.equal(settled.opacity, 1);
        assert.equal(settled.hold, false);
        assert.equal(settled.status, pullRefreshStatus('error'));
        assert.equal(settled.transform.owner, 'react-state-dom-style');
        assert.ok(settled.transform.distance < 80);
    });

    it('treats a timed-out refresh as an error and ignores a newer generation', () => {
        const state = pullingState({ phase: 'refreshing', generation: 5 });
        const timedOut = settleRefreshResult(state, 5, {
            ok: false,
            timedOut: true,
            error: new Error('timed out'),
            rows: [{ id: 'late' }],
        });
        assert.equal(timedOut.outcome, 'timeout');
        assert.equal(timedOut.phase, 'error');
        assert.equal(timedOut.timedOut, true);
        assert.equal(timedOut.opacity, 1);
        assert.equal(timedOut.status, VENUE_REFRESH_TIMEOUT_STATUS);
        assert.equal(timedOut.transform.owner, 'react-state-dom-style');

        const late = settleRefreshResult(state, 4, { ok: true, rows: [{ id: 'late' }] });
        assert.equal(late.ignored, true);
        assert.equal(late.phase, undefined);
    });
});

describe('mascot pointer loss and termination', () => {
    it('resets the transform owner on pointer cancellation before refresh', () => {
        assert.equal(pointerLossEffect('pulling'), 'reset');
        assert.equal(pointerLossEffect('ready'), 'reset');
        const next = applyMascotTermination(pullingState(), 'touchcancel');
        assert.equal(next.phase, 'idle');
        assert.equal(next.opacity, 0);
        assert.equal(next.dropInFlight, false);
        assert.equal(next.releasePointer, true);
        assert.equal(next.clearTimer, true);
        assert.equal(next.generation, 2);
        assert.equal(next.transform.transform, idlePullTransform().transform);
        assert.equal(next.transform.owner, 'react-state-dom-style');
    });

    it('uses the same effect for lost pointer capture and keeps an in-flight refresh', () => {
        assert.equal(pointerLossEffect('refreshing'), 'release-only');
        assert.equal(pointerLossEffect('pulling'), pointerLossEffect('ready'));
        const refreshing = pullingState({ phase: 'refreshing', distance: 80, scale: 1.12, generation: 7 });
        assert.equal(pointerLossEffect(refreshing.phase), 'release-only');
        const cancelled = applyMascotTermination(refreshing, 'touchcancel');
        assert.equal(cancelled.phase, 'idle');
        assert.equal(cancelled.dropInFlight, false);
    });

    it('drops the in-flight result and resets opacity on unmount, sheet close, and venue change', () => {
        for (const reason of ['unmount', 'sheet-close', 'venue-change']) {
            const next = applyMascotTermination(
                pullingState({ phase: 'refreshing', distance: 80, scale: 1.12, generation: 3 }),
                reason,
            );
            assert.equal(next.phase, 'idle', reason);
            assert.equal(next.opacity, 0, reason);
            assert.equal(next.dropInFlight, true, reason);
            assert.equal(next.generation, 4, reason);
            assert.equal(next.releasePointer, true, reason);
            assert.equal(next.clearTimer, true, reason);
            assert.equal(next.transform.transform, idlePullTransform().transform, reason);
            const late = settleRefreshResult({
                phase: next.phase,
                generation: next.generation,
                showMascot: true,
            }, 3, { ok: true });
            assert.equal(late.ignored, true, reason);
        }
    });

    it('resets a threshold miss without dropping a later refresh generation', () => {
        const next = applyMascotTermination(pullingState({ phase: 'ready' }), 'threshold-miss');
        assert.equal(next.phase, 'idle');
        assert.equal(next.opacity, actorOpacityForPhase('idle', true));
        assert.equal(next.dropInFlight, false);
        assert.equal(next.generation, 2);
        assert.equal(next.transform.transform, idlePullTransform().transform);
    });
});
