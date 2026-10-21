import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    WEATHER_RETRY_DELAY_MS,
    WEATHER_RETRY_MIN_GAP_MS,
    weatherRetryDecision,
} from './weatherRecovery.js';

const base = { live: false, inFlight: false, timedRetryUsed: false, lastAttemptAt: 1_000, now: 2_000 };

describe('weatherRetryDecision', () => {
    it('schedules one timed retry after the first failure', () => {
        assert.deepEqual(weatherRetryDecision({ ...base, trigger: 'failed' }),
            { retry: true, delayMs: WEATHER_RETRY_DELAY_MS });
    });

    it('never schedules a second timed retry', () => {
        assert.deepEqual(weatherRetryDecision({ ...base, timedRetryUsed: true, trigger: 'failed' }), { retry: false });
    });

    it('never retries while live weather is on screen', () => {
        for (const trigger of ['failed', 'online', 'visible']) {
            assert.deepEqual(weatherRetryDecision({ ...base, live: true, now: 1e9, trigger }), { retry: false });
        }
    });

    it('never retries while a request is in flight', () => {
        for (const trigger of ['failed', 'online', 'visible']) {
            assert.deepEqual(weatherRetryDecision({ ...base, inFlight: true, now: 1e9, trigger }), { retry: false });
        }
    });

    it('retries at once on online or visible after the minimum gap', () => {
        const now = base.lastAttemptAt + WEATHER_RETRY_MIN_GAP_MS;
        for (const trigger of ['online', 'visible']) {
            assert.deepEqual(weatherRetryDecision({ ...base, timedRetryUsed: true, now, trigger }),
                { retry: true, delayMs: 0 });
        }
    });

    it('ignores online or visible inside the minimum gap', () => {
        const now = base.lastAttemptAt + WEATHER_RETRY_MIN_GAP_MS - 1;
        for (const trigger of ['online', 'visible']) {
            assert.deepEqual(weatherRetryDecision({ ...base, now, trigger }), { retry: false });
        }
    });

    it('allows an event retry when no attempt time is known', () => {
        assert.deepEqual(weatherRetryDecision({ ...base, lastAttemptAt: null, trigger: 'online' }),
            { retry: true, delayMs: 0 });
    });

    it('ignores unknown triggers', () => {
        assert.deepEqual(weatherRetryDecision({ ...base, trigger: 'focus' }), { retry: false });
    });
});
