import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRowSunQueue } from './rowSunQueue.js';

// A manual scheduler with runWhenIdle's signature: slices run only on step().
function manualScheduler() {
    const scheduled = [];
    return {
        schedule(job, { onDone }) {
            const entry = { job, onDone, cancelled: false };
            scheduled.push(entry);
            return () => { entry.cancelled = true; };
        },
        // Run one slice of the oldest live job; `budget` rows before yielding.
        step(budget = Infinity) {
            const entry = scheduled.find((e) => !e.cancelled && !e.done);
            if (!entry) return false;
            let used = 0;
            const done = entry.job.run(() => ++used >= budget);
            if (done) { entry.done = true; entry.onDone(entry.job.result); }
            return true;
        },
        get live() { return scheduled.filter((e) => !e.cancelled && !e.done).length; },
    };
}

const setup = (options = {}) => {
    const calls = [];
    const scheduler = manualScheduler();
    const queue = createRowSunQueue({
        compute: (input) => { calls.push(input); if (input === 'boom') throw new Error('bad'); return `day:${input}`; },
        schedule: scheduler.schedule,
        failed: 'FAILED',
        ...options,
    });
    return { queue, scheduler, calls };
};

describe('createRowSunQueue', () => {
    it('computes nothing until an idle slice runs, then answers every listener', () => {
        const { queue, scheduler, calls } = setup();
        const got = [];
        queue.request('a', 'a', (v) => got.push(['a', v]));
        queue.request('b', 'b', (v) => got.push(['b', v]));
        assert.equal(calls.length, 0, 'no work during the request (render / scroll frame)');
        scheduler.step();
        assert.deepEqual(got, [['a', 'day:a'], ['b', 'day:b']]);
        assert.equal(queue.get('a'), 'day:a');
    });

    it('yields when the slice budget is used and continues in the next slice, in request order', () => {
        const { queue, scheduler, calls } = setup();
        for (const k of ['a', 'b', 'c']) queue.request(k, k, () => {});
        scheduler.step(1);
        assert.deepEqual(calls, ['a']);
        scheduler.step(1);
        scheduler.step(1);
        assert.deepEqual(calls, ['a', 'b', 'c']);
        assert.equal(queue.pendingCount, 0);
    });

    it('answers cached keys at once and computes each key only once', () => {
        const { queue, scheduler, calls } = setup();
        queue.request('a', 'a', () => {});
        queue.request('a', 'a', () => {});
        scheduler.step();
        assert.deepEqual(calls, ['a']);
        let value;
        queue.request('a', 'a', (v) => { value = v; });
        assert.equal(value, 'day:a');
        assert.equal(scheduler.live, 0);
    });

    it('drops a request once its last row unmounts', () => {
        const { queue, scheduler, calls } = setup();
        const stop = queue.request('a', 'a', () => {});
        queue.request('b', 'b', () => {});
        stop();
        scheduler.step();
        assert.deepEqual(calls, ['b']);
    });

    it('does no work while paused (scrolling) and resumes after', () => {
        const { queue, scheduler, calls } = setup();
        queue.request('a', 'a', () => {});
        queue.setPaused(true);
        assert.equal(queue.paused, true);
        assert.equal(scheduler.step(), false, 'the pending slice was cancelled');
        queue.request('b', 'b', () => {});
        assert.equal(scheduler.live, 0, 'nothing scheduled while paused');
        queue.setPaused(false);
        scheduler.step();
        assert.deepEqual(calls, ['a', 'b']);
    });

    it('stores the failed value when compute throws, so the row falls back', () => {
        const { queue, scheduler } = setup();
        let value;
        queue.request('x', 'boom', (v) => { value = v; });
        scheduler.step();
        assert.equal(value, 'FAILED');
        assert.equal(queue.get('x'), 'FAILED');
    });
});
