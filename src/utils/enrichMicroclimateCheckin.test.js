import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHECKIN_TIMEOUT_MS, MONITOR_CONFIG, MONITOR_SLUG, checkInBody, checkInUrl, sendCheckIn,
} from '../../supabase/functions/enrich-microclimate/checkin.js';

const DSN = 'https://abc123def@o4501.ingest.us.sentry.io/4502';
const URL_FOR_DSN = 'https://o4501.ingest.us.sentry.io/api/4502/cron/enrich-microclimate/abc123def/';

test('builds the Crons check-in URL from a DSN', () => {
  assert.equal(checkInUrl(DSN), URL_FOR_DSN);
  assert.equal(checkInUrl(`  ${DSN}\n`), URL_FOR_DSN, 'pasted secrets often carry whitespace');
  assert.equal(checkInUrl('https://key@o1.ingest.sentry.io/77'), 'https://o1.ingest.sentry.io/api/77/cron/enrich-microclimate/key/');
  assert.equal(checkInUrl('https://key@sentry.example.com:9000/prefix/5'), 'https://sentry.example.com:9000/prefix/api/5/cron/enrich-microclimate/key/');
  assert.equal(checkInUrl(DSN, 'other job'), 'https://o4501.ingest.us.sentry.io/api/4502/cron/other%20job/abc123def/');
});

test('a missing or malformed DSN switches the check-in off', () => {
  for (const dsn of [undefined, null, '', '   ', 'not a url', 'http://key@o1.ingest.sentry.io/1',
    'https://o1.ingest.sentry.io/1', 'https://key@o1.ingest.sentry.io/', 'https://key@o1.ingest.sentry.io/abc',
    'https://key:secret@o1.ingest.sentry.io/1', 'https://key@o1.ingest.sentry.io/1?x=1', 42, {}]) {
    assert.equal(checkInUrl(dsn), null, String(dsn));
  }
});

test('only a fully ok run checks in as ok', () => {
  assert.deepEqual(checkInBody({ ok: true, code: 'complete' }), { status: 'ok', monitor_config: MONITOR_CONFIG });
  for (const result of [
    { ok: false, code: 'invalid_config' }, { ok: false, code: 'partial' }, { ok: false, code: 'initialization_failed' },
    { ok: 'true' }, {}, null, undefined,
  ]) {
    assert.equal(checkInBody(result).status, 'error', JSON.stringify(result));
  }
});

test('the monitor schedule matches the pg_cron job', () => {
  const migration = readFileSync(new URL('../../supabase/migrations/20260918034428_schedule_enrich_microclimate_cron.sql', import.meta.url), 'utf8');
  const schedule = /cron\.schedule\(\s*'enrich-microclimate-every-20m',\s*'([^']+)'/.exec(migration)?.[1];
  assert.equal(schedule, '*/20 * * * *');
  assert.equal(MONITOR_CONFIG.schedule.type, 'crontab');
  assert.equal(MONITOR_CONFIG.schedule.value, schedule);
  assert.equal(MONITOR_CONFIG.timezone, 'UTC');
  assert.equal(MONITOR_SLUG, 'enrich-microclimate');
  // The margin must stay under the 20-minute interval or a missed run is never seen before the next one.
  assert.ok(MONITOR_CONFIG.checkin_margin > 0 && MONITOR_CONFIG.checkin_margin < 20);
  assert.ok(MONITOR_CONFIG.failure_issue_threshold >= 1);
  assert.ok(Object.isFrozen(MONITOR_CONFIG) && Object.isFrozen(MONITOR_CONFIG.schedule));
});

test('no DSN: nothing is sent', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true }; };
  assert.equal(await sendCheckIn({ dsn: undefined, result: { ok: true }, fetchImpl }), 'off');
  assert.equal(await sendCheckIn({ dsn: 'garbage', result: { ok: false }, fetchImpl }), 'off');
  assert.equal(await sendCheckIn(), 'off');
  assert.equal(calls, 0);
});

test('posts one JSON check-in with the run status', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 202 }; };
  assert.equal(await sendCheckIn({ dsn: DSN, result: { ok: false, code: 'invalid_config' }, fetchImpl }), 'sent');
  assert.equal(sent.length, 1);
  const [{ url, init }] = sent;
  assert.equal(url, URL_FOR_DSN);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(init.body), { status: 'error', monitor_config: JSON.parse(JSON.stringify(MONITOR_CONFIG)) });
});

test('releases the response body without reading it', async () => {
  let cancelled = false;
  const body = { cancel: async () => { cancelled = true; } };
  assert.equal(await sendCheckIn({ dsn: DSN, result: { ok: true }, fetchImpl: async () => ({ ok: true, body }) }), 'sent');
  assert.equal(cancelled, true);
});

test('Sentry errors, network failures and odd responses never throw', async () => {
  const cases = [
    async () => ({ ok: false, status: 429 }),
    async () => ({ ok: false, status: 500, body: { cancel: async () => { throw new Error('boom'); } } }),
    async () => { throw new TypeError('network down'); },
    () => { throw new Error('synchronous throw'); },
    async () => undefined,
  ];
  for (const fetchImpl of cases) {
    assert.equal(await sendCheckIn({ dsn: DSN, result: { ok: true }, fetchImpl }), 'failed');
  }
});

test('a hanging Sentry cannot hold the job past the timeout', async () => {
  let signal;
  const fetchImpl = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  const started = performance.now();
  assert.equal(await sendCheckIn({ dsn: DSN, result: { ok: true }, fetchImpl, timeoutMs: 20 }), 'failed');
  assert.ok(performance.now() - started < 1000);
  assert.equal(signal.aborted, true);
  assert.ok(CHECKIN_TIMEOUT_MS <= 5000, 'the check-in must stay small next to the 45 s run budget');
});

test('the DSN never appears in what the job logs', async () => {
  for (const fetchImpl of [async () => ({ ok: true }), async () => { throw new Error(`failed ${DSN}`); }]) {
    const outcome = await sendCheckIn({ dsn: DSN, result: { ok: true }, fetchImpl });
    assert.ok(['sent', 'failed'].includes(outcome));
    assert.ok(!String(outcome).includes('abc123def'));
  }
});
