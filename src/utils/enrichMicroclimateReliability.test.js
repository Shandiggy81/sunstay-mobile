import test from 'node:test';
import assert from 'node:assert/strict';
import { bounded, fetchWeatherJSON, validateWeather, runEnrichment, cellKey, LIMITS, validWrite } from '../../supabase/functions/enrich-microclimate/reliability.js';
import { scoreVenue, melbourneHour } from '../../supabase/functions/enrich-microclimate/scoring.js';

const now = new Date('2026-11-17T02:00:00Z');
const point = { lat: -37.85, lng: 144.95 };
function weather(p = point, overrides = {}) {
  return { latitude: p.lat, longitude: p.lng, utc_offset_seconds: 0,
    current_units: { time: 'unixtime', interval: 'seconds', wind_speed_10m: 'm/s', wind_direction_10m: '°', cloud_cover: '%', shortwave_radiation: 'W/m²' },
    current: { time: now.getTime() / 1000, interval: 900, wind_speed_10m: 0,
      wind_direction_10m: 0, cloud_cover: 0, shortwave_radiation: 0 }, ...overrides };
}
const profile = id => ({ venue_id: id, venues: { ...point }, sun_hour_fraction: Array(24).fill(.6), wind_exposure_by_sector: Array(8).fill(.5) });
// DB uses lng whereas the weather response uses longitude.
const response = value => ({ ok: true, json: async () => value });
const score = (p, w, date) => scoreVenue(p, w, melbourneHour(date));
const validated = row => validateWeather(row, [point], now.getTime());

test('slow headers AND slow bodies time out; abort delivered', async () => {
  for (const body of [false, true]) {
    let signal;
    const fetchImpl = async (_url, opts) => { signal = opts.signal;
      if (body) return { ok: true, json: () => new Promise(() => {}) };
      return new Promise(() => {});
    };
    await assert.rejects(fetchWeatherJSON('unused', { fetchImpl, deadline: performance.now() + 10000, timeoutMs: 10, retryDelayMs: 1 }), /timeout/);
    assert.equal(signal.aborted, true);
  }
});
test('transient HTTP and network failures retry once; successful response consumed', async () => {
  for (const status of [429, 500, 546, 'network']) {
    let calls = 0;
    const result = await fetchWeatherJSON('unused', { deadline: performance.now() + 20000, retryDelayMs: 1,
      fetchImpl: async () => { if (++calls === 1) {
        if (status === 'network') throw new TypeError('network');
        return { ok: false, status };
      } return response({ good: true }); } });
    assert.equal(calls, 2); assert.deepEqual(result, { good: true });
  }
});
test('400, malformed JSON, Retry-After do not retry; no budget means no fetch', async () => {
  for (const r of [{ ok: false, status: 400 }, { ok: true, json: async () => { throw new SyntaxError(); } },
    { ok: false, status: 429, headers: { get: () => '120' } }]) {
    let calls = 0;
    await assert.rejects(fetchWeatherJSON('unused', { deadline: performance.now() + 20000, fetchImpl: async () => { calls++; return r; } }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(fetchWeatherJSON('unused', { deadline: 1, clock: () => 0, fetchImpl: () => { calls++; } }), /deadline/);
  assert.equal(calls, 0);
});
test('retry is refused when remaining budget cannot cover attempt plus write reserve', async () => {
  let clock = 0, calls = 0;
  await assert.rejects(fetchWeatherJSON('unused', { deadline: 13000, clock: () => clock,
    fetchImpl: async () => { calls++; clock = 8000; throw new TypeError(); } }), /deadline/);
  assert.equal(calls, 1);
});
test('overall bound stops database work that never resolves', async () => {
  await assert.rejects(bounded(() => new Promise(() => {}), { deadline: performance.now() + 10, timeoutMs: 4000 }), /timeout/);
});
test('shifted model-grid coordinates are mapped to REQUEST key, preserving zero wind/cloud', () => {
  const result = validated(weather({ lat: -37.82, lng: 144.98 }));
  assert.equal(result.get(cellKey(point.lat, point.lng)).windSpeed, 0);
  assert.equal(result.get(cellKey(point.lat, point.lng)).cloud, 0);
  assert.equal(result.has(cellKey(-37.82, 144.98)), false);
});
test('cardinality and coordinate association fail closed', () => {
  assert.throws(() => validated([]), /cardinality/);
  assert.throws(() => validated([weather(), weather()]), /cardinality/);
  for (const row of [weather({ lat: 10, lng: 10 }), weather(point, { location_id: 2 }), weather(point, { latitude: null })])
    assert.throws(() => validated(row), /association/);
});
test('missing, string, nonfinite and out-of-range essential weather never becomes calm', () => {
  for (const field of ['wind_speed_10m', 'wind_direction_10m', 'cloud_cover']) {
    for (const value of [null, undefined, '', '0', NaN, Infinity, -1, 999]) {
      const row = weather(); row.current[field] = value;
      assert.equal(validated(row).size, 0, `${field}: ${value}`);
    }
  }
});
test('units, timestamps, offset and optional radiation validation', () => {
  for (const mutate of [r => r.current_units.wind_speed_10m = 'km/h', r => r.utc_offset_seconds = 3600,
    r => r.current.time -= 1801, r => r.current.time += 301, r => r.current.time = 'invalid',
    r => r.current.interval = 0, r => r.current.shortwave_radiation = -1,
    r => r.current_units.shortwave_radiation = 'bad']) {
    const row = weather(); mutate(row); assert.equal(validated(row).size, 0);
  }
  const missing = weather(); delete missing.current.shortwave_radiation;
  assert.equal(validated(missing).size, 1);
});

async function run(rows, extra = {}) {
  const writes = [], reads = [];
  const result = await runEnrichment({ wallNow: () => now, pageSize: 50, score,
    selectPage: async args => { reads.push(args); return rows.filter(r => args.after === null || r.venue_id > args.after).slice(0, args.limit); },
    fetchImpl: async url => {
      const u = new URL(url), lats = u.searchParams.get('latitude').split(',').map(Number), lngs = u.searchParams.get('longitude').split(',').map(Number);
      return response(lats.map((lat, i) => weather({ lat, lng: lngs[i] })));
    },
    writeBatch: async batch => { writes.push(batch); return batch.length; }, ...extra });
  return { result, writes, reads };
}
test('1081 profiles page without skips and bulk write in <=200 chunks', async () => {
  const rows = Array.from({ length: 1081 }, (_, i) => profile(String(i).padStart(4, '0')));
  const { result, writes, reads } = await run(rows);
  assert.equal(result.ok, true); assert.equal(result.updated, 1081);
  assert.equal(reads.length, 22); assert.equal(writes.length, 6);
  assert.equal(new Set(writes.flat().map(r => r.venue_id)).size, 1081);
  assert.ok(writes.flat().every(validWrite));
  assert.equal(reads[0].cutoff, '2026-11-17T02:22:00.000Z');
});
test('partial weather skips only bad rows and never writes fallback weather', async () => {
  const a = profile('a'), b = profile('b'); b.venues = { lat: -38.5, lng: 145.5 };
  const bad = weather(b.venues); bad.current.wind_speed_10m = null;
  const { result, writes } = await run([a, b], { fetchImpl: async () => response([weather(), bad]) });
  assert.equal(result.ok, false); assert.equal(result.updated, 1); assert.equal(result.skipped, 1);
  assert.equal(writes[0][0].venue_id, 'a'); assert.equal(writes[0][0].effective_wind, 0);
});
test('bulk failure or wrong count stops processing without success or retry', async () => {
  for (const fail of [true, false]) {
    let calls = 0;
    const { result } = await run([profile('a')], { writeBatch: async () => { calls++; if (fail) throw new Error('private database details'); return 0; } });
    assert.equal(calls, 1); assert.equal(result.updated, 0); assert.equal(result.code, 'bulk_failed');
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});
test('capacity and malformed paging are explicit failures', async () => {
  const { result } = await run(Array.from({ length: 2001 }, (_, i) => profile(String(i).padStart(5, '0'))));
  assert.equal(result.selected, 2000); assert.equal(result.capped, true); assert.equal(result.ok, false);
  const bad = await run([], { selectPage: async () => [profile('a'), profile('a')] });
  assert.equal(bad.result.code, 'invalid_page');
});
test('freshness refreshes at 20m, before 30m expiry, with <=2m schedule jitter', async () => {
  let expiry = now.getTime() + 30 * 60000;
  for (const elapsed of [20, 40, 60]) {
    const time = new Date(now.getTime() + (elapsed + 2) * 60000);
    assert.ok(time.getTime() < expiry);
    const { result } = await run([profile('a')], { wallNow: () => time,
      selectPage: async ({ cutoff }) => expiry <= Date.parse(cutoff) ? [profile('a')] : [],
      fetchImpl: async () => { const r = weather(); r.current.time = time.getTime() / 1000; return response(r); },
      writeBatch: async rows => { expiry = time.getTime() + 30 * 60000; return rows.length; } });
    assert.equal(result.updated, 1);
  }
});
test('bad configuration, invalid venue coordinates and empty selection', async () => {
  assert.equal((await run([], { ttlMinutes: '60' })).result.code, 'invalid_config');
  assert.equal((await run([], { pageSize: 'NaN' })).result.code, 'invalid_config');
  assert.equal((await run([])).result.ok, true);
  const p = profile('bad'); p.venues.lat = null;
  assert.equal((await run([p])).result.skipped, 1);
});

test('overall invocation deadline stops a stalled selection and prevents writes', async () => {
  let writes = 0;
  const { result } = await run([], { deadline: performance.now() + 15,
    selectPage: async () => new Promise(() => {}), writeBatch: async () => { writes++; } });
  assert.equal(result.ok, false); assert.equal(writes, 0);
  assert.ok(result.elapsed_ms < 1000);
});
test('cardinality failure leaves existing weather untouched', async () => {
  const { result, writes } = await run([profile('a')], { fetchImpl: async () => response([]) });
  assert.equal(result.weather_failures, 1); assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1); assert.equal(writes.length, 0);
});
test('profiles beyond the refresh-ahead window are not selected', async () => {
  const expiry = now.getTime() + 29 * 60000;
  const { result } = await run([], { selectPage: async ({ cutoff }) =>
    expiry <= Date.parse(cutoff) ? [profile('a')] : [] });
  assert.equal(result.selected, 0); assert.equal(result.weather_attempts, 0);
});
test('bulk timeout is bounded, not retried, and reported as an unknown outcome', async () => {
  let time = 0, writes = 0;
  const { result } = await run([profile('a')], { clock: () => time, deadline: 12001,
    fetchImpl: async () => { time = 11990; return response(weather()); },
    writeBatch: async () => { writes++; return new Promise(() => {}); } });
  assert.equal(writes, 1); assert.equal(result.updated, 0);
  assert.equal(result.write_outcome_unknown, true); assert.equal(result.unprocessed, 1);
});
