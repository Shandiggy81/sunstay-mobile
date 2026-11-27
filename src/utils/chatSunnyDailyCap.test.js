import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DAILY_ASK_CAP,
    MAX_DAILY_ASK_CAP,
    dailyCapFromEnv,
    melbourneDay,
    secondsUntilMelbourneMidnight,
    takeDailySlot,
} from '../../supabase/functions/chat-sunny/dailyCap.js';

const HOUR = 3600;
// 11pm AEDT on Wed 25 Nov 2026: an hour before the count resets.
const NOW = Date.parse('2026-11-25T12:00:00Z');
const env = { supabaseUrl: 'https://example.supabase.co/', serviceRoleKey: 'fake-service-role-key' };
const answer = (body, status = 200) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
});

describe('chat-sunny melbourneDay', () => {
    it('rolls over at Melbourne midnight, not UTC midnight', () => {
        // AEDT, UTC+11: midnight on 26 Nov is 13:00Z on 25 Nov.
        assert.equal(melbourneDay(Date.parse('2026-11-25T12:59:59Z')), '2026-11-25');
        assert.equal(melbourneDay(Date.parse('2026-11-25T13:00:00Z')), '2026-11-26');
        // AEST in winter, UTC+10: midnight on 2 Jul is 14:00Z on 1 Jul.
        assert.equal(melbourneDay(Date.parse('2026-07-01T13:59:59Z')), '2026-07-01');
        assert.equal(melbourneDay(Date.parse('2026-07-01T14:00:00Z')), '2026-07-02');
    });
});

describe('chat-sunny secondsUntilMelbourneMidnight', () => {
    it('counts down to the next Melbourne midnight', () => {
        assert.equal(secondsUntilMelbourneMidnight(NOW), HOUR);
        assert.equal(secondsUntilMelbourneMidnight(Date.parse('2026-11-25T13:00:00Z')), 24 * HOUR, 'just after midnight');
        assert.equal(secondsUntilMelbourneMidnight(Date.parse('2026-11-25T12:59:59.500Z')), 1, 'never less than a second');
    });

    it('allows for the 23- and 25-hour days when daylight saving starts and ends', () => {
        // 4 Oct 2026, clocks skip 2am AEST to 3am AEDT: 1am to midnight is 22 hours.
        assert.equal(secondsUntilMelbourneMidnight(Date.parse('2026-10-03T15:00:00Z')), 22 * HOUR);
        // 5 Apr 2026, clocks go back from 3am AEDT to 2am AEST: 1am to midnight is 24 hours.
        assert.equal(secondsUntilMelbourneMidnight(Date.parse('2026-04-04T14:00:00Z')), 24 * HOUR);
    });
});

describe('chat-sunny dailyCapFromEnv', () => {
    it('uses the approved cap when the secret is unset or not a whole number', () => {
        assert.equal(DAILY_ASK_CAP, 500);
        for (const raw of [undefined, null, '', '  ', 'abc', '-5', '2.5', '1e3', '500 asks']) {
            assert.equal(dailyCapFromEnv(raw), DAILY_ASK_CAP, String(raw));
        }
    });

    it('takes a whole number, 0 to turn Gemini off, and caps huge values', () => {
        assert.equal(dailyCapFromEnv('1000'), 1000);
        assert.equal(dailyCapFromEnv(' 250 '), 250);
        assert.equal(dailyCapFromEnv('0'), 0);
        assert.equal(dailyCapFromEnv(String(MAX_DAILY_ASK_CAP * 10)), MAX_DAILY_ASK_CAP);
    });
});

describe('chat-sunny takeDailySlot', () => {
    it("takes a slot from the Melbourne day's count over PostgREST with the service-role key", async () => {
        const calls = [];
        const fetchImpl = async (url, init) => {
            calls.push({ url, init });
            return answer(true)();
        };
        assert.deepEqual(await takeDailySlot({ ...env, now: NOW, fetchImpl }), { ok: true });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/chat_sunny_take_daily_slot');
        assert.equal(calls[0].init.method, 'POST');
        assert.equal(calls[0].init.headers.apikey, 'fake-service-role-key');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-service-role-key');
        assert.deepEqual(JSON.parse(calls[0].init.body), { p_day: '2026-11-25', p_cap: DAILY_ASK_CAP });
    });

    it('refuses once the cap is used up, with Retry-After at Melbourne midnight', async () => {
        assert.deepEqual(await takeDailySlot({ ...env, now: NOW, fetchImpl: answer(false) }), {
            ok: false,
            retryAfterSec: HOUR,
        });
    });

    it('refuses without asking the database when the cap is 0', async () => {
        let called = false;
        const fetchImpl = async () => {
            called = true;
            return answer(true)();
        };
        assert.deepEqual(await takeDailySlot({ ...env, cap: 0, now: NOW, fetchImpl }), { ok: false, retryAfterSec: HOUR });
        assert.equal(called, false);
    });

    it('lets the ask through and says why when the check itself fails', async () => {
        assert.deepEqual(await takeDailySlot({ supabaseUrl: '', serviceRoleKey: 'k', now: NOW, fetchImpl: answer(true) }), {
            ok: true,
            skipped: 'missing_env',
        });

        // Before the migration is applied, PostgREST can't find the function.
        const missing = await takeDailySlot({
            ...env,
            now: NOW,
            fetchImpl: answer({ code: 'PGRST202', message: 'Could not find the function' }, 404),
        });
        assert.equal(missing.ok, true);
        assert.equal(missing.skipped, 'http_404');
        assert.match(missing.detail, /PGRST202/);

        const offline = await takeDailySlot({
            ...env,
            now: NOW,
            fetchImpl: async () => {
                throw new TypeError('fetch failed');
            },
        });
        assert.deepEqual(offline, { ok: true, skipped: 'unreachable' });

        for (const body of [null, 'yes', 1]) {
            assert.deepEqual(await takeDailySlot({ ...env, now: NOW, fetchImpl: answer(body) }), {
                ok: true,
                skipped: 'bad_response',
            });
        }
    });

    it('gives up on a slow database after the timeout', async () => {
        // AbortSignal.timeout's timer doesn't keep Node running. A real fetch
        // holds its socket open while it waits, so this stand-in holds a timer;
        // without it the runner can exit first and cancel the test.
        const hang = (url, init) => new Promise((resolve, reject) => {
            const socket = setTimeout(resolve, 5000);
            init.signal.addEventListener('abort', () => {
                clearTimeout(socket);
                reject(init.signal.reason);
            });
        });
        assert.deepEqual(await takeDailySlot({ ...env, now: NOW, fetchImpl: hang, timeoutMs: 5 }), {
            ok: true,
            skipped: 'timeout',
        });
    });
});
