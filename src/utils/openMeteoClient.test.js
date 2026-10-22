import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOW_DIRECT_OPEN_METEO, fetchOpenMeteoResponse } from './openMeteoClient.js';

const directUrl = 'https://api.open-meteo.com/v1/forecast?latitude=-37.81234&longitude=144.96567&hourly=temperature_2m';
const configured = {
  supabaseUrl: 'https://weather-test.supabase.invalid/',
  anonKey: 'test-public-anon-key',
  directUrl,
};

test('configured requests use only the weather kind and coordinates with anon auth', async () => {
  const response = Response.json({ current: { temperature_2m: 18 }, hourly: { time: [] } });
  const controller = new AbortController();
  const calls = [];
  const result = await fetchOpenMeteoResponse('hourly', -37.81234, 144.96567, {
    ...configured,
    signal: controller.signal,
    fetchImpl: async (...args) => { calls.push(args); return response; },
  });
  assert.equal(result, response);
  assert.deepEqual(await result.json(), { current: { temperature_2m: 18 }, hourly: { time: [] } });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, 'https://weather-test.supabase.invalid/functions/v1/weather?kind=hourly&lat=-37.81234&lng=144.96567');
  assert.equal(options.method, 'GET');
  assert.deepEqual(options.headers, {
    apikey: configured.anonKey,
    Authorization: `Bearer ${configured.anonKey}`,
  });
  assert.equal(options.signal, controller.signal);
});

test('missing Supabase configuration keeps the existing direct URL and response', async () => {
  assert.equal(ALLOW_DIRECT_OPEN_METEO, true);
  const response = Response.json({ hourly: { pm2_5: [3] } });
  const calls = [];
  const result = await fetchOpenMeteoResponse('air', -37.81, 144.96, {
    directUrl,
    supabaseUrl: '',
    anonKey: '',
    fetchImpl: async (...args) => { calls.push(args); return response; },
  });
  assert.equal(result, response);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], directUrl);
  assert.deepEqual(calls[0][1], { signal: undefined });
});

test('HTTP failure falls back without sending anon credentials upstream', async () => {
  const response = Response.json({ current: { temperature_2m: 20 } });
  const calls = [];
  const result = await fetchOpenMeteoResponse('forecast', -37.81, 144.96, {
    ...configured,
    fetchImpl: async (...args) => {
      calls.push(args);
      return calls.length === 1 ? new Response(null, { status: 502 }) : response;
    },
  });
  assert.equal(result, response);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], directUrl);
  assert.deepEqual(calls[1][1], { signal: undefined });
});

test('network failure falls back within the same caller signal', async () => {
  const controller = new AbortController();
  const response = Response.json({ hourly: {} });
  const calls = [];
  const result = await fetchOpenMeteoResponse('hourly', -37.81, 144.96, {
    ...configured,
    signal: controller.signal,
    fetchImpl: async (...args) => {
      calls.push(args);
      if (calls.length === 1) throw new TypeError('Network unavailable');
      return response;
    },
  });
  assert.equal(result, response);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].signal, controller.signal);
});

test('an already aborted caller makes no requests', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(fetchOpenMeteoResponse('forecast', -37.81, 144.96, {
    ...configured,
    signal: controller.signal,
    fetchImpl: async () => { calls += 1; },
  }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('AbortError and exhausted caller timeouts never start a direct fallback', async () => {
  for (const abortSignal of [false, true]) {
    const controller = new AbortController();
    const failure = abortSignal ? new TypeError('Fetch failed') : new DOMException('Aborted', 'AbortError');
    let calls = 0;
    await assert.rejects(fetchOpenMeteoResponse('forecast', -37.81, 144.96, {
      ...configured,
      signal: controller.signal,
      fetchImpl: async () => {
        calls += 1;
        if (abortSignal) controller.abort();
        throw failure;
      },
    }), (error) => error === failure);
    assert.equal(calls, 1);
  }
});

test('a non-OK response after timeout does not start a direct fallback', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(fetchOpenMeteoResponse('forecast', -37.81, 144.96, {
    ...configured,
    signal: controller.signal,
    fetchImpl: async () => {
      calls += 1;
      controller.abort();
      return new Response(null, { status: 502 });
    },
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('disabling direct calls preserves function HTTP errors and network errors', async () => {
  const response = new Response(null, { status: 429 });
  let calls = 0;
  assert.equal(await fetchOpenMeteoResponse('air', -37.81, 144.96, {
    ...configured,
    allowDirect: false,
    fetchImpl: async () => { calls += 1; return response; },
  }), response);
  const failure = new TypeError('Network unavailable');
  await assert.rejects(fetchOpenMeteoResponse('air', -37.81, 144.96, {
    ...configured,
    allowDirect: false,
    fetchImpl: async () => { calls += 1; throw failure; },
  }), (error) => error === failure);
  assert.equal(calls, 2);
});

test('disabling direct calls without config fails without a request', async () => {
  let calls = 0;
  await assert.rejects(fetchOpenMeteoResponse('forecast', -37.81, 144.96, {
    directUrl,
    supabaseUrl: '',
    anonKey: '',
    allowDirect: false,
    fetchImpl: async () => { calls += 1; },
  }), /Weather service unavailable/);
  assert.equal(calls, 0);
});

test('unknown weather kinds are rejected without a request', async () => {
  let calls = 0;
  await assert.rejects(fetchOpenMeteoResponse('arbitrary', -37.81, 144.96, {
    ...configured,
    fetchImpl: async () => { calls += 1; },
  }), /Unsupported weather kind/);
  assert.equal(calls, 0);
});
