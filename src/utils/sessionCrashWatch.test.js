import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_OPEN_KEY, classifyPreviousSession, watchSessionCrashes } from './sessionCrashWatch.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
    };
}

function eventTarget(extra = {}) {
    const listeners = {};
    return {
        ...extra,
        addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
        removeEventListener: (type, fn) => listeners[type]?.delete(fn),
        fire: (type, event = {}) => listeners[type]?.forEach((fn) => fn(event)),
        count: (type) => listeners[type]?.size ?? 0,
    };
}

describe('session crash watch', () => {
    it('does not report a first load or a clean reload', () => {
        const storage = memoryStorage();
        const reports = [];
        const target = eventTarget();
        const first = watchSessionCrashes({ storage, target, report: (k) => reports.push(k) });
        assert.equal(first.previousEnd, null);
        target.fire('pagehide');
        const second = watchSessionCrashes({ storage, target: eventTarget(), report: (k) => reports.push(k) });
        assert.equal(second.previousEnd, null);
        assert.deepEqual(reports, []);
    });

    it('reports a foreground end when the visible page never fired pagehide', () => {
        const storage = memoryStorage();
        const doc = eventTarget({ visibilityState: 'visible' });
        watchSessionCrashes({ storage, target: eventTarget(), doc });
        const reports = [];
        const next = watchSessionCrashes({ storage, target: eventTarget(), report: (k) => reports.push(k) });
        assert.equal(next.previousEnd, 'foreground');
        assert.deepEqual(reports, ['foreground']);
    });

    it('reports a background end when the page was hidden before it vanished', () => {
        const storage = memoryStorage();
        const doc = eventTarget({ visibilityState: 'visible' });
        watchSessionCrashes({ storage, target: eventTarget(), doc });
        doc.visibilityState = 'hidden';
        doc.fire('visibilitychange');
        const reports = [];
        watchSessionCrashes({ storage, target: eventTarget(), report: (k) => reports.push(k) });
        assert.deepEqual(reports, ['background']);
    });

    it('goes back to foreground when the user returns to the tab', () => {
        const storage = memoryStorage();
        const doc = eventTarget({ visibilityState: 'hidden' });
        watchSessionCrashes({ storage, target: eventTarget(), doc });
        assert.equal(storage.getItem(SESSION_OPEN_KEY), 'hidden');
        doc.visibilityState = 'visible';
        doc.fire('visibilitychange');
        assert.equal(storage.getItem(SESSION_OPEN_KEY), '1');
    });

    it('ignores a visibilitychange that arrives after a clean pagehide', () => {
        const storage = memoryStorage();
        const target = eventTarget();
        const doc = eventTarget({ visibilityState: 'visible' });
        watchSessionCrashes({ storage, target, doc });
        target.fire('pagehide');
        doc.visibilityState = 'hidden';
        doc.fire('visibilitychange');
        assert.equal(storage.getItem(SESSION_OPEN_KEY), null);
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
        assert.equal(watchSessionCrashes({ storage: null }).previousEnd, null);
        const throwing = {
            getItem() { throw new Error('blocked'); },
            setItem() { throw new Error('blocked'); },
            removeItem() { throw new Error('blocked'); },
        };
        const target = eventTarget();
        const doc = eventTarget({ visibilityState: 'visible' });
        const watch = watchSessionCrashes({ storage: throwing, target, doc });
        assert.equal(watch.previousEnd, null);
        target.fire('pagehide');
        watch.stop();
        assert.equal(target.count('pagehide'), 0);
        assert.equal(target.count('pageshow'), 0);
        assert.equal(doc.count('visibilitychange'), 0);
    });

    it('classifies stored flags', () => {
        assert.deepEqual(['1', 'hidden', null, 'other'].map(classifyPreviousSession), ['foreground', 'background', null, null]);
    });
});
