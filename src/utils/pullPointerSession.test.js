import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    clearPullPointerSession,
    shouldAcceptPullPointerDown,
    shouldHandlePullPointer,
} from './pullPointerSession.js';

function session(overrides = {}) {
    return {
        tracking: false,
        confirmed: false,
        pointerId: null,
        lastDy: 0,
        ...overrides,
    };
}

describe('shouldAcceptPullPointerDown', () => {
    it('rejects a non-primary finger and a second down while a pull is tracking', () => {
        assert.equal(
            shouldAcceptPullPointerDown({ isPrimary: false, pointerId: 2 }, session()),
            false,
        );
        assert.equal(
            shouldAcceptPullPointerDown(
                { isPrimary: true, pointerId: 9 },
                session({ tracking: true, pointerId: 1 }),
            ),
            false,
        );
        assert.equal(
            shouldAcceptPullPointerDown({ isPrimary: true, pointerId: 1 }, session()),
            true,
        );
    });
});

describe('shouldHandlePullPointer', () => {
    it('ignores move/up/cancel/lostcapture from any pointer that does not own the session', () => {
        const active = session({ tracking: true, pointerId: 7 });
        assert.equal(shouldHandlePullPointer({ pointerId: 7 }, active), true);
        assert.equal(shouldHandlePullPointer({ pointerId: 8 }, active), false);
        assert.equal(shouldHandlePullPointer({ pointerId: 7 }, session()), false);
    });
});

describe('clearPullPointerSession', () => {
    it('fully clears pointerId when the gesture terminates', () => {
        const active = session({
            tracking: true,
            confirmed: true,
            pointerId: 11,
            lastDy: 64,
        });
        const cleared = clearPullPointerSession(active);
        assert.equal(cleared.tracking, false);
        assert.equal(cleared.confirmed, false);
        assert.equal(cleared.pointerId, null);
        assert.equal(cleared.lastDy, 0);
        assert.equal(active.pointerId, null);
    });
});
