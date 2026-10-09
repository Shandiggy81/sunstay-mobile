import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_OPEN_KEY, watchSessionCrashes } from './sessionCrashWatch.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
    };
}

function eventTarget() {
    const listeners = {};
    return {
        addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
        removeEventListener: (type, fn) => listeners[type]?.delete(fn),
        fire: (type, event = {}) => listeners[type]?.forEach((fn) => fn(event)),
        count: (type) => listeners[type]?.size ?? 0,
    };
}

describe('session crash watch', () => {
    it('does not report a first load or a clean reload', () => {
        const storage = memoryStorage();
        let reports = 0;
        const target = eventTarget();
        const first = watchSessionCrashes({ storage, target, report: () => { reports += 1; } });
        assert.equal(first.previousEndedAbnormally, false);
        target.fire('pagehide');
        const second = watchSessionCrashes({ storage, target: eventTarget(), report: () => { reports += 1; } });
        assert.equal(second.previousEndedAbnormally, false);
        assert.equal(reports, 0);
    });

    it('reports once when the previous page never fired pagehide', () => {
        const storage = memoryStorage();
        let reports = 0;
        watchSessionCrashes({ storage, target: eventTarget() });
        const next = watchSessionCrashes({ storage, target: eventTarget(), report: () => { reports += 1; } });
        assert.equal(next.previousEndedAbnormally, true);
        assert.equal(reports, 1);
        assert.equal(storage.getItem(SESSION_OPEN_KEY), '1');
    });

    it('marks a back/forward cache restore as open again', () => {
        const storage = memoryStorage();
        const target = eventTarget();
        watchSessionCrashes({ storage, target });
        target.fire('pagehide', { persisted: true });
        assert.equal(storage.getItem(SESSION_OPEN_KEY), null);
        target.fire('pageshow', { persisted: true });
        assert.equal(storage.getItem(SESSION_OPEN_KEY), '1');
    });

    it('survives missing or throwing storage and removes its listeners', () => {
        assert.equal(watchSessionCrashes({ storage: null }).previousEndedAbnormally, false);
        const throwing = {
            getItem() { throw new Error('blocked'); },
            setItem() { throw new Error('blocked'); },
            removeItem() { throw new Error('blocked'); },
        };
        const target = eventTarget();
        const watch = watchSessionCrashes({ storage: throwing, target });
        assert.equal(watch.previousEndedAbnormally, false);
        target.fire('pagehide');
        watch.stop();
        assert.equal(target.count('pagehide'), 0);
        assert.equal(target.count('pageshow'), 0);
    });
});
