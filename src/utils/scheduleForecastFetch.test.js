import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveForecastView } from './resolveForecastView.js';
import {
    FORECAST_FETCH_SETTLE_MS,
    createForecastSettleGate,
    scheduleForecastFetch,
    shouldStartForecastFetch,
} from './scheduleForecastFetch.js';

describe('staged sun forecast fetch', () => {
    it('asks the idle callback to give up after the sheet settle window', () => {
        let captured = null;
        const cancel = scheduleForecastFetch(() => {}, {
            idle(callback, options) {
                captured = { callback, options };
                return 4;
            },
            cancelIdle() {},
        });
        assert.equal(FORECAST_FETCH_SETTLE_MS, 300);
        assert.equal(captured.options.timeout, 300);
        cancel();
    });

    it('does not start the fetch when the panel unmounts first', () => {
        let calls = 0;
        let idleId = null;
        let callback = null;
        const cancel = scheduleForecastFetch(() => {
            calls += 1;
        }, {
            idle(fn) {
                callback = fn;
                idleId = 11;
                return idleId;
            },
            cancelIdle(id) {
                assert.equal(id, 11);
                idleId = null;
            },
        });
        cancel();
        callback();
        assert.equal(calls, 0);
        assert.equal(idleId, null);
    });

    it('uses one cancelable timer when the browser has no idle callback', () => {
        let calls = 0;
        let cleared = null;
        let callback = null;
        const cancel = scheduleForecastFetch(() => {
            calls += 1;
        }, {
            idle: null,
            delay(fn, ms) {
                callback = fn;
                assert.equal(ms, 300);
                return 'timer-1';
            },
            clearDelay(id) {
                cleared = id;
            },
        });
        cancel();
        assert.equal(cleared, 'timer-1');
        callback();
        assert.equal(calls, 0);
    });

    it('ignores a callback armed for an older venue generation', () => {
        const started = [];
        const pending = [];
        const gate = createForecastSettleGate();
        const options = {
            idle(fn) {
                pending.push(fn);
                return pending.length;
            },
            cancelIdle() {},
        };
        const first = gate.arm((generation) => started.push(generation), options);
        const second = gate.arm((generation) => started.push(generation), options);
        assert.notEqual(first, second);
        pending[0]();
        pending[1]();
        assert.deepEqual(started, [second]);
    });

    it('drops a deferred start after cleanup', () => {
        const started = [];
        let callback = null;
        const gate = createForecastSettleGate();
        gate.arm((generation) => started.push(generation), {
            idle(fn) {
                callback = fn;
                return 1;
            },
            cancelIdle() {},
        });
        gate.cancel();
        callback();
        assert.deepEqual(started, []);
    });

    it('keeps the loading view until the settle gate opens the fetch', () => {
        assert.equal(shouldStartForecastFetch({ fetchReady: false, enabled: true, hasCoords: true }), false);
        assert.equal(shouldStartForecastFetch({ fetchReady: true, enabled: false, hasCoords: true }), false);
        assert.equal(shouldStartForecastFetch({ fetchReady: true, enabled: true, hasCoords: false }), false);
        assert.equal(shouldStartForecastFetch({ fetchReady: true, enabled: true, hasCoords: true }), true);
        assert.equal(resolveForecastView({ loading: true, error: false, items: [] }), 'loading');
        assert.equal(resolveForecastView({ loading: false, error: true, items: [] }), 'error');
        assert.equal(resolveForecastView({ loading: false, error: false, items: [] }), 'empty');
    });
});
