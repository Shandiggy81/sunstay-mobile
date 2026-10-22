import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BOUNDS } from '../config/mapBounds.js';
import {
  CACHE_TTL_MS, WEATHER_BOUNDS, createCache, parseWeatherRequest, weatherUrl,
} from '../../supabase/functions/weather/request.js';
import { createWeatherHandler } from '../../supabase/functions/weather/handler.js';

const params = (over = {}) => new URLSearchParams({ kind: 'forecast', lat: '-37.8136', lng: '144.9631', ...over });
const request = (over = {}, options = {}) => new Request(`https://example.test/functions/v1/weather?${params(over)}`, options);
const WEATHER = { latitude: -37.81, longitude: 144.96, current: { temperature_2m: 18 }, hourly: { pm2_5: [6] } };
const upstream = (value = WEATHER) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('only forecast, hourly and air are allowed, within the same bounds as the map', () => {
  assert.deepEqual(WEATHER_BOUNDS, MAX_BOUNDS);
  for (const kind of ['forecast', 'hourly', 'air']) assert.equal(parseWeatherRequest(params({ kind })).ok, true);
  for (const kind of ['', 'weather', 'Forecast', 'geocoding', '__proto__']) {
    assert.deepEqual(parseWeatherRequest(params({ kind })), { ok: false, status: 400, error: 'invalid_kind' });
  }
  const missing = params(); missing.delete('kind');
  assert.equal(parseWeatherRequest(missing).error, 'invalid_kind');
});

test('coordinates must be single finite decimal numbers inside greater Melbourne before rounding', () => {
  for (const value of ['', ' ', 'NaN', 'Infinity', '-Infinity', '0x90', '144,145', '-37.81x', '1e3']) {
    for (const field of ['lat', 'lng']) {
      assert.equal(parseWeatherRequest(params({ [field]: value })).error, 'invalid_coordinates', `${field} ${value}`);
    }
  }
  for (const field of ['lat', 'lng']) {
    const missing = params(); missing.delete(field);
    assert.equal(parseWeatherRequest(missing).error, 'invalid_coordinates');
  }
  for (const over of [{ lat: '-38.2001' }, { lat: '-37.4999' }, { lng: '144.4999' }, { lng: '145.5001' }]) {
    assert.equal(parseWeatherRequest(params(over)).error, 'outside_bounds');
  }
  assert.equal(parseWeatherRequest(params({ lat: '-38.2', lng: '144.5' })).ok, true);
  assert.equal(parseWeatherRequest(params({ lat: '-37.5', lng: '145.5' })).ok, true);
});

test('rounding is shared by upstream coordinates and kind-specific cache keys', () => {
  const parsed = parseWeatherRequest(params());
  assert.deepEqual(parsed.query, { kind: 'forecast', lat: '-37.81', lng: '144.96' });
  assert.equal(parsed.cacheKey, 'forecast:-37.81,144.96');
  assert.equal(parseWeatherRequest(params({ lat: '-37.812', lng: '144.964' })).cacheKey, parsed.cacheKey);
  assert.notEqual(parseWeatherRequest(params({ kind: 'hourly' })).cacheKey, parsed.cacheKey);
  assert.notEqual(parseWeatherRequest(params({ lng: '144.97' })).cacheKey, parsed.cacheKey);
  const url = new URL(weatherUrl(parsed.query));
  assert.equal(url.searchParams.get('latitude'), '-37.81');
  assert.equal(url.searchParams.get('longitude'), '144.96');
});

test('all unknown parameters are ignored, including host, key and upstream overrides', () => {
  const original = parseWeatherRequest(params());
  const extra = parseWeatherRequest(params({
    url: 'https://attacker.test/', host: 'attacker.test', apikey: 'CALLER-KEY',
    latitude: '0', longitude: '0', current: 'evil', forecast_days: '999', timezone: 'GMT',
  }));
  assert.deepEqual(extra, original);
  assert.equal(weatherUrl(extra.query), weatherUrl(original.query));
  assert.equal(weatherUrl(extra.query).includes('CALLER-KEY'), false);
  assert.equal(weatherUrl(extra.query).includes('attacker'), false);
});

test('forecast and hourly use precisely the existing fixed app parameter sets', () => {
  const forecast = new URL(weatherUrl(parseWeatherRequest(params()).query));
  assert.deepEqual(Object.fromEntries(forecast.searchParams), {
    latitude: '-37.81', longitude: '144.96',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,uv_index,is_day,shortwave_radiation,surface_pressure',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,uv_index,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,wind_speed_10m_max',
    timezone: 'Australia/Melbourne', forecast_days: '2', wind_speed_unit: 'kmh',
  });
  const hourly = new URL(weatherUrl(parseWeatherRequest(params({ kind: 'hourly' })).query));
  assert.deepEqual(Object.fromEntries(hourly.searchParams), {
    latitude: '-37.81', longitude: '144.96',
    hourly: 'temperature_2m,apparent_temperature,weather_code,weathercode,precipitation_probability,cloud_cover,cloudcover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,windgusts_10m,precipitation,visibility,sunshine_duration,shortwave_radiation,direct_normal_irradiance',
    timezone: 'auto', forecast_days: '1', wind_speed_unit: 'kmh',
  });
  const air = new URL(weatherUrl(parseWeatherRequest(params({ kind: 'air' })).query));
  assert.deepEqual(Object.fromEntries(air.searchParams), {
    latitude: '-37.81', longitude: '144.96', current: 'pm2_5', hourly: 'pm2_5', timezone: 'auto', forecast_days: '1',
  });
});

test('the server secret selects fixed customer hosts and appears only in the upstream URL', () => {
  for (const kind of ['forecast', 'hourly', 'air']) {
    const parsed = parseWeatherRequest(params({ kind }));
    const free = new URL(weatherUrl(parsed.query));
    const paid = new URL(weatherUrl(parsed.query, 'SERVER-SECRET'));
    assert.equal(free.hostname, kind === 'air' ? 'air-quality-api.open-meteo.com' : 'api.open-meteo.com');
    assert.equal(paid.hostname, kind === 'air' ? 'customer-air-quality-api.open-meteo.com' : 'customer-api.open-meteo.com');
    assert.equal(paid.pathname, kind === 'air' ? '/v1/air-quality' : '/v1/forecast');
    assert.equal(free.searchParams.has('apikey'), false);
    assert.equal(paid.searchParams.get('apikey'), 'SERVER-SECRET');
    assert.equal(JSON.stringify(parsed).includes('SERVER-SECRET'), false);
  }
});

test('cache expiry is ten minutes for forecast/hourly and thirty for air, with bounded entries', () => {
  assert.deepEqual(CACHE_TTL_MS, { forecast: 600_000, hourly: 600_000, air: 1_800_000 });
  const cache = createCache(2);
  cache.set('forecast', 'a', CACHE_TTL_MS.forecast, 0);
  cache.set('air', 'b', CACHE_TTL_MS.air, 0);
  assert.equal(cache.get('forecast', 599_999), 'a');
  assert.equal(cache.get('forecast', 600_000), null);
  assert.equal(cache.get('air', 1_799_999), 'b');
  assert.equal(cache.get('air', 1_800_000), null);
  cache.set('a', 1, 1000, 0); cache.set('b', 2, 1000, 0);
  cache.set('a', 3, 1000, 0); // Updating an entry must not evict another entry.
  assert.equal(cache.get('b', 0), 2);
  cache.set('c', 4, 1000, 0);
  assert.equal(cache.get('a', 0), null);
  assert.equal(cache.get('c', 0), 4);
});

test('handler returns the raw payload with CORS, shares rounded cache entries and expires them', async () => {
  let clock = 0;
  const calls = [];
  const handle = createWeatherHandler({ now: () => clock, getApiKey: () => 'SERVER-SECRET', fetchImpl: async (...args) => {
    calls.push(args); return upstream();
  } });
  const first = await handle(request());
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(first.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await first.json(), WEATHER);
  assert.equal(calls[0][0].includes('SERVER-SECRET'), true);
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
  const hit = await handle(request({ lat: '-37.812', lng: '144.964' }));
  assert.deepEqual(await hit.json(), WEATHER);
  assert.equal(calls.length, 1);
  clock = CACHE_TTL_MS.forecast;
  assert.equal((await handle(request())).status, 200);
  assert.equal(calls.length, 2);
  assert.equal((await handle(request({ kind: 'air' }))).status, 200);
  clock += CACHE_TTL_MS.forecast;
  assert.equal((await handle(request({ kind: 'air' }))).status, 200);
  assert.equal(calls.length, 3); // Air has its own, longer-lived entry.
});

test('OPTIONS, unsupported methods and invalid requests do not call upstream', async () => {
  const handle = createWeatherHandler({ fetchImpl: async () => assert.fail('unexpected upstream call') });
  const options = await handle(request({}, { method: 'OPTIONS' }));
  assert.equal(options.status, 200);
  assert.equal(options.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.match(options.headers.get('access-control-allow-headers'), /authorization/);
  const post = await handle(request({}, { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, OPTIONS');
  assert.deepEqual(await post.json(), { error: 'method_not_allowed' });
  assert.equal((await handle(request({ lat: 'bad' }))).status, 400);
  assert.equal((await handle(request({ kind: 'other' }))).status, 400);
});

test('upstream HTTP/network/JSON failures never return or log the key, URL or upstream body', async (t) => {
  const secret = 'PRIVATE-UPSTREAM-SECRET';
  const logCalls = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logCalls.push(args));
  const exception = new Error(`https://customer-api.open-meteo.com/?apikey=${secret}`);
  exception.name = secret;
  const failures = [
    async () => ({ ok: false, status: 429, json: () => assert.fail('must not read upstream error body') }),
    async () => ({ ok: false, status: 401, text: () => secret }),
    async () => { throw exception; },
    async () => ({ ok: true, json: async () => { throw exception; } }),
    async () => upstream({ echoed_url: `?apikey=${secret}` }),
    async () => upstream(null),
    async () => upstream([]),
  ];
  for (const fetchImpl of failures) {
    const handle = createWeatherHandler({ getApiKey: () => secret, fetchImpl });
    const result = await handle(request());
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await result.json(), { error: 'upstream_error' });
  }
  assert.deepEqual(logCalls, []);
});

test('failed responses are not cached and the handler rate limits each client before more upstream work', async () => {
  let calls = 0;
  const handle = createWeatherHandler({ now: () => 0, fetchImpl: async () => { calls++; return upstream(); } });
  const options = { headers: { 'cf-connecting-ip': '203.0.113.4' } };
  for (let i = 0; i < 20; i++) {
    assert.equal((await handle(request({ lng: (144.5 + i / 100).toFixed(2) }, options))).status, 200);
  }
  const limited = await handle(request({ lng: '145.00' }, options));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  assert.equal(calls, 20);
  assert.equal((await handle(request({ lng: '144.50' }, options))).status, 200); // Shared hits use no upstream quota.
  assert.equal((await handle(request({ lng: '145.00' }, { headers: { 'cf-connecting-ip': '203.0.113.5' } }))).status, 200);

  let attempts = 0;
  const retry = createWeatherHandler({ fetchImpl: async () => {
    attempts++;
    return attempts === 1 ? new Response('private upstream body', { status: 500 }) : upstream();
  } });
  assert.equal((await retry(request())).status, 502);
  assert.equal((await retry(request())).status, 200);
  assert.equal(attempts, 2);
});
