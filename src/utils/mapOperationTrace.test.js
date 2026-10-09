import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMapRecoveryState, noteContextLost } from './mapRecovery.js';
import {
    getMapOperationTrace,
    isMapOperationTraceEnabled,
    noteMapOperation,
    resetMapOperationTrace,
    traceMapOperation,
} from './mapOperationTrace.js';

const TRACE_EVENTS = [
    'venue-open',
    'venue-close',
    'sheet-state-change',
    'resize-observer-callback',
    'map-resize-start',
    'map-resize-end',
    'map-flyto-start',
    'map-flyto-end',
    'marker-sync-start',
    'marker-sync-end',
    'context-loss',
    'map-remove',
    'resume-start',
    'session-lock',
];

describe('map operation trace', () => {
    it('stays off outside diagnostic mode and does not record', () => {
        resetMapOperationTrace();
        assert.equal(isMapOperationTraceEnabled(), false);
        assert.equal(traceMapOperation('map-resize-start', { generation: 1 }), null);
        assert.equal(getMapOperationTrace().last, '');
        assert.equal(getMapOperationTrace().enabled, false);
    });

    it('keeps the event immediately before context loss', () => {
        resetMapOperationTrace();
        for (const name of TRACE_EVENTS) {
            if (name === 'context-loss') break;
            noteMapOperation(name, { generation: 2 });
        }
        const loss = noteMapOperation('context-loss', { generation: 2 });
        noteMapOperation('map-remove', { generation: 2 });
        noteMapOperation('resume-start', { generation: 3 });
        noteMapOperation('session-lock', { generation: 2 });
        assert.equal(loss.preceding, 'marker-sync-end');
        assert.equal(getMapOperationTrace().precedingLoss, 'marker-sync-end');
        assert.equal(getMapOperationTrace().last, 'session-lock');
        assert.deepEqual(
            getMapOperationTrace().events.map((event) => event.name),
            [
                ...TRACE_EVENTS.slice(0, TRACE_EVENTS.indexOf('context-loss')),
                'context-loss',
                'map-remove',
                'resume-start',
                'session-lock',
            ],
        );
    });

    it('does not change session lock when a loss is recorded', () => {
        const live = { ...createMapRecoveryState(), phase: 'live', generation: 1 };
        const first = noteContextLost(live, 1, 0);
        const second = noteContextLost({
            ...first.state,
            phase: 'live',
            generation: 2,
            resumeAttempts: 1,
        }, 2, 10);
        assert.equal(second.state.sessionLocked, true);
        assert.equal(second.state.phase, 'paused');
    });
});
