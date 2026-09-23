import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    VENUE_REFRESH_TIMEOUT_MS,
    abortableDelay,
    createVenueRefreshRequest,
    shouldCommitVenueResult,
} from './venueRefreshRequest.js';

function createClock() {
    let items = [];
    let seq = 1;
    return {
        setTimer(fn, ms) {
            const id = seq++;
            items.push({ id, fn, remaining: ms });
            return id;
        },
        clearTimer(id) {
            items = items.filter((item) => item.id !== id);
        },
        fire(ms) {
            for (const item of items) item.remaining -= ms;
            const due = items.filter((item) => item.remaining <= 0);
            items = items.filter((item) => item.remaining > 0);
            for (const item of due) item.fn();
        },
        pending() {
            return items.length;
        },
    };
}

function createRequest(clock, AbortControllerImpl = AbortController) {
    return createVenueRefreshRequest({
        timeoutMs: VENUE_REFRESH_TIMEOUT_MS,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        AbortControllerImpl,
    });
}

describe('venue refresh request', () => {
    it('resolves a refresh and clears the busy flag and timeout', async () => {
        const clock = createClock();
        const request = createRequest(clock);
        const pending = request.execute(async (signal) => {
            assert.equal(signal.aborted, false);
            return { ok: true, rows: [{ id: 'a' }] };
        }, { userInitiated: true });
        assert.equal(request.isUserRefresh(), true);
        const outcome = await pending;
        assert.equal(outcome.rows[0].id, 'a');
        assert.equal(shouldCommitVenueResult(outcome), true);
        assert.equal(request.isUserRefresh(), false);
        assert.equal(clock.pending(), 0);
        clock.fire(VENUE_REFRESH_TIMEOUT_MS);
        assert.equal(clock.pending(), 0);
    });

    it('rejects a refresh, clears busy state, and does not commit rows', async () => {
        const clock = createClock();
        const request = createRequest(clock);
        const outcome = await request.execute(async () => {
            throw new Error('network down');
        }, { userInitiated: true });
        assert.equal(outcome.ok, false);
        assert.equal(outcome.timedOut, false);
        assert.equal(outcome.rows, null);
        assert.match(outcome.error.message, /network down/);
        assert.equal(shouldCommitVenueResult(outcome), false);
        assert.equal(request.isUserRefresh(), false);
        assert.equal(clock.pending(), 0);
    });

    it('aborts a hanging refresh at 5s, ignores the late result, and clears the timeout', async () => {
        const clock = createClock();
        const aborts = [];
        class RecordingAbortController {
            constructor() {
                this.signal = { aborted: false };
                aborts.push(this);
            }
            abort() {
                this.signal.aborted = true;
            }
        }
        const request = createRequest(clock, RecordingAbortController);
        let resolveLate;
        const pending = request.execute(() => new Promise((resolve) => {
            resolveLate = resolve;
        }), { userInitiated: true });
        await Promise.resolve();
        assert.equal(request.isUserRefresh(), true);
        clock.fire(4999);
        assert.equal(request.isUserRefresh(), true);
        assert.equal(aborts[0].signal.aborted, false);
        clock.fire(1);
        const outcome = await pending;
        assert.equal(outcome.timedOut, true);
        assert.equal(outcome.ok, false);
        assert.equal(outcome.rows, null);
        assert.equal(shouldCommitVenueResult(outcome), false);
        assert.equal(request.isUserRefresh(), false);
        assert.equal(aborts[0].signal.aborted, true);
        assert.equal(clock.pending(), 0);
        resolveLate({ ok: true, rows: [{ id: 'late' }] });
        await Promise.resolve();
        assert.equal(outcome.rows, null);
        assert.equal(shouldCommitVenueResult(outcome), false);
        clock.fire(VENUE_REFRESH_TIMEOUT_MS);
        assert.equal(aborts.length, 1);
    });

    it('does not let a finished request clear the live timeout or busy flag', async () => {
        const clock = createClock();
        const request = createRequest(clock);
        let resolveFirst;
        const first = request.execute(() => new Promise((resolve) => {
            resolveFirst = resolve;
        }), { userInitiated: true });
        await Promise.resolve();
        let resolveSecond;
        const second = request.execute(() => new Promise((resolve) => {
            resolveSecond = resolve;
        }), { userInitiated: true });
        await Promise.resolve();
        assert.equal(clock.pending(), 1);
        resolveFirst({ ok: true, rows: [{ id: 'stale' }] });
        const stale = await first;
        assert.equal(stale.ignored, true);
        assert.equal(shouldCommitVenueResult(stale), false);
        assert.equal(request.isUserRefresh(), true);
        assert.equal(clock.pending(), 1);
        resolveSecond({ ok: true, rows: [{ id: 'fresh' }] });
        const fresh = await second;
        assert.equal(fresh.rows[0].id, 'fresh');
        assert.equal(shouldCommitVenueResult(fresh), true);
        assert.equal(request.isUserRefresh(), false);
        assert.equal(clock.pending(), 0);
    });

    it('clears busy state, the timer, and late results when unmounted during refresh', async () => {
        const clock = createClock();
        const request = createRequest(clock);
        let resolveLate;
        const pending = request.execute((signal) => new Promise((resolve, reject) => {
            resolveLate = resolve;
            signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            });
        }), { userInitiated: true });
        await Promise.resolve();
        assert.equal(request.isUserRefresh(), true);
        request.abortAll();
        const outcome = await pending;
        assert.equal(outcome.ignored, true);
        assert.equal(request.isUserRefresh(), false);
        assert.equal(clock.pending(), 0);
        resolveLate({ ok: true, rows: [{ id: 'late' }] });
        await Promise.resolve();
        assert.equal(shouldCommitVenueResult(outcome), false);
    });

    it('aborts abortableDelay so a hang cannot outlive the timeout', async () => {
        const request = createVenueRefreshRequest({ timeoutMs: 40 });
        const started = Date.now();
        const outcome = await request.execute(
            (signal) => abortableDelay(5000, signal).then(() => ({ ok: true, rows: [{ id: 'late' }] })),
            { userInitiated: true },
        );
        assert.equal(outcome.timedOut, true);
        assert.equal(outcome.rows, null);
        assert.equal(request.isUserRefresh(), false);
        assert.ok(Date.now() - started < 1000);
    });
});
