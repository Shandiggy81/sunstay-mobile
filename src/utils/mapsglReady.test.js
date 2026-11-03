import test from 'node:test';
import assert from 'node:assert/strict';
import { whenControllerReady } from './mapsglReady.js';

function fakeController({ ready = false } = {}) {
    const listeners = {};
    return {
        isReady: ready,
        once(name, fn) { (listeners[name] ??= []).push(fn); },
        off(name, fn) { listeners[name] = (listeners[name] ?? []).filter(f => f !== fn); },
        emit(name) { const fns = listeners[name] ?? []; listeners[name] = []; for (const fn of fns) fn(); },
        count(name) { return (listeners[name] ?? []).length; },
    };
}

test('a ready controller resolves straight away', async () => {
    const c = fakeController({ ready: true });
    assert.equal(await whenControllerReady(c), c);
    assert.equal(c.count('load'), 0, 'no listener needed');
});

test('a loading controller resolves on its load event, not before', async () => {
    const c = fakeController();
    let done = false;
    const pending = whenControllerReady(c, { timeoutMs: 1000 }).then(v => { done = true; return v; });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(done, false, 'still waiting while the SDK loads');
    c.isReady = true;
    c.emit('load');
    assert.equal(await pending, c);
});

test('gives up after the timeout and removes its listener', async () => {
    const c = fakeController();
    await assert.rejects(whenControllerReady(c, { timeoutMs: 20 }), /too long/);
    assert.equal(c.count('load'), 0);
});

test('no controller is an error, not a hang', async () => {
    await assert.rejects(whenControllerReady(null), /No map controller/);
});
