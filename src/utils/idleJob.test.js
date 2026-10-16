import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWhenIdle, IDLE_FALLBACK_DELAY_MS, IDLE_NEXT_TIMEOUT_MS, IDLE_SLICE_MS, IDLE_TIMEOUT_MS } from './idleJob.js';

// A fake browser: a manual clock and a queue of pending callbacks.
function fakeEnv({ idle = true } = {}) {
    const env = { t: 0, queue: [], cancelled: [], idleOpts: [], delays: [] };
    let next = 1;
    env.now = () => env.t;
    if (idle) {
        env.requestIdle = (cb, opts) => { const h = next++; env.idleOpts.push(opts); env.queue.push({ h, cb }); return h; };
        env.cancelIdle = (h) => { env.cancelled.push(h); env.queue = env.queue.filter((q) => q.h !== h); };
    } else {
        env.requestIdle = null;
        env.cancelIdle = null;
    }
    env.setTimer = (cb, ms) => { const h = next++; env.delays.push(ms); env.queue.push({ h, cb }); return h; };
    env.clearTimer = (h) => { env.cancelled.push(h); env.queue = env.queue.filter((q) => q.h !== h); };
    // Fire the oldest pending callback, as an idle period with `left` ms.
    env.fire = (deadline = { didTimeout: false, timeRemaining: () => 50 }) => {
        const item = env.queue.shift();
        assert.ok(item, 'nothing scheduled');
        item.cb(deadline);
    };
    return env;
}

// A job of `n` units; each unit takes `cost` ms on the fake clock.
function countingJob(env, n, cost = 1) {
    let i = 0;
    return {
        result: [],
        units: () => i,
        run(shouldYield) {
            while (i < n) {
                env.t += cost;
                this.result.push(i++);
                if (i < n && shouldYield()) return false;
            }
            return true;
        },
    };
}

describe('runWhenIdle', () => {
    it('schedules nothing synchronously and runs the job in slices', () => {
        const env = fakeEnv();
        const job = countingJob(env, 30, 1);
        let done = null;
        runWhenIdle(job, { env, onDone: (r) => { done = r; } });
        assert.equal(job.units(), 0);
        assert.equal(env.queue.length, 1);
        env.fire();
        assert.equal(job.units(), IDLE_SLICE_MS, 'one slice is at most sliceMs of work');
        assert.equal(done, null);
        while (env.queue.length) env.fire();
        assert.equal(job.units(), 30);
        assert.equal(done, job.result);
    });

    it('waits longer for the first slice, then keeps later slices coming on a busy page', () => {
        const env = fakeEnv();
        runWhenIdle(countingJob(env, 30), { env, onDone() {} });
        env.fire({ didTimeout: true, timeRemaining: () => 0 });
        env.fire({ didTimeout: true, timeRemaining: () => 0 });
        assert.deepEqual(env.idleOpts.slice(0, 3), [
            { timeout: IDLE_TIMEOUT_MS }, { timeout: IDLE_NEXT_TIMEOUT_MS }, { timeout: IDLE_NEXT_TIMEOUT_MS },
        ]);
        assert.ok(IDLE_NEXT_TIMEOUT_MS < IDLE_TIMEOUT_MS);
    });

    it('keeps a slice inside a shorter idle period', () => {
        const env = fakeEnv();
        const job = countingJob(env, 30, 1);
        runWhenIdle(job, { env, onDone() {} });
        env.fire({ didTimeout: false, timeRemaining: () => 3 });
        assert.equal(job.units(), 3);
    });

    it('still makes progress when the idle callback timed out or has no time left', () => {
        const env = fakeEnv();
        const job = countingJob(env, 30, 1);
        runWhenIdle(job, { env, onDone() {} });
        env.fire({ didTimeout: true, timeRemaining: () => 0 });
        assert.equal(job.units(), IDLE_SLICE_MS);
        env.fire({ didTimeout: false, timeRemaining: () => 0 });
        assert.ok(job.units() > IDLE_SLICE_MS);
    });

    it('falls back to a short timer without requestIdleCallback (iOS Safari)', () => {
        const env = fakeEnv({ idle: false });
        const job = countingJob(env, 20, 1);
        let done = false;
        runWhenIdle(job, { env, onDone: () => { done = true; } });
        assert.deepEqual(env.delays, [IDLE_FALLBACK_DELAY_MS]);
        while (env.queue.length) env.fire(null);
        assert.equal(done, true);
        assert.equal(job.units(), 20);
    });

    it('cancel stops further slices and never calls onDone', () => {
        const env = fakeEnv();
        const job = countingJob(env, 30, 1);
        let calls = 0;
        const cancel = runWhenIdle(job, { env, onDone: () => { calls++; } });
        env.fire();
        const after = job.units();
        cancel();
        assert.equal(env.queue.length, 0);
        assert.equal(env.cancelled.length, 1);
        assert.equal(job.units(), after);
        assert.equal(calls, 0);
        cancel(); // a second cancel is harmless
    });

    it('cancel before the first slice clears the timer fallback too', () => {
        const env = fakeEnv({ idle: false });
        const cancel = runWhenIdle(countingJob(env, 5), { env, onDone() { assert.fail('should not finish'); } });
        cancel();
        assert.equal(env.queue.length, 0);
    });

    it('finishes an empty job on the first slice', () => {
        const env = fakeEnv();
        let done = null;
        runWhenIdle({ result: 'r', run: () => true }, { env, onDone: (r) => { done = r; } });
        env.fire();
        assert.equal(done, 'r');
        assert.equal(env.queue.length, 0);
    });
});
