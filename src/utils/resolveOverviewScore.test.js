import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOverviewScore } from './resolveOverviewScore.js';
import { resolveSunFraction } from './microclimate.js';

const LOCAL_CURVE = [
  0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.8, 1.0, 1.0, 1.0,
  1.0, 0.9, 0.7, 0.3, 0, 0, 0, 0, 0, 0, 0, 0,
];
const AEST_DAY = new Date('2026-09-17T00:00:00Z');
const rpcEntry = (overrides = {}) => ({
  id: 'df-01',
  sun_now: 0,
  effective_sun: null,
  effective_wind: null,
  comfort_hint: null,
  geometry_confidence: 0.2,
  sun_hour_fraction: LOCAL_CURVE,
  ...overrides,
});

test('uses getSunstayScoreResult as the only Overview score source', () => {
  const venue = { id: 'v1' };
  const result = resolveOverviewScore({
    loading: false,
    venue,
    weatherScore: 12,
    solarScore: 99,
    getSunstayScoreResult: (v) => {
      assert.equal(v, venue);
      return { score: 81, label: 'Peak Comfort' };
    },
  });

  assert.deepEqual(result, {
    score: 81,
    label: 'Peak Comfort',
    unavailable: false,
    loading: false,
  });
});

test('does not fall back to weather.score or solar helpers when context score is missing', () => {
  const result = resolveOverviewScore({
    loading: false,
    venue: { id: 'v1' },
    weatherScore: 70,
    solarScore: 55,
    getSunstayScoreResult: () => ({ score: null, label: 'Score unavailable', unavailable: true }),
  });

  assert.equal(result.score, null);
  assert.equal(result.unavailable, true);
  assert.equal(result.label, 'Score unavailable');
});

test('returns a loading state without mixing in fallback scores', () => {
  const result = resolveOverviewScore({
    loading: true,
    weatherScore: 70,
    getSunstayScoreResult: () => ({ score: 88, label: 'Peak Comfort' }),
  });

  assert.deepEqual(result, {
    score: null,
    label: null,
    unavailable: false,
    loading: true,
  });
});

test('score at scrubbed todMinutes matches resolveSunFraction for that RPC entry', () => {
  const venue = { id: 'df-01' };
  const entry = rpcEntry();
  const todMinutes = 14 * 60;
  const result = resolveOverviewScore({
    loading: false,
    venue,
    microclimateEntry: entry,
    todMinutes,
    now: AEST_DAY,
    getSunstayScoreResult: () => ({ score: 84, label: 'Peak Comfort' }),
  });

  const fraction = resolveSunFraction(entry, todMinutes, AEST_DAY);
  assert.equal(fraction, 0.7);
  assert.equal(result.score, Math.round(fraction * 100));
  assert.equal(result.score, 70);
  assert.notEqual(result.score, 84);
  assert.equal(result.unavailable, false);
  assert.equal(result.loading, false);
});

test('night-time RPC sun of 0 does not fall through to the wall-clock weather score', () => {
  const result = resolveOverviewScore({
    loading: false,
    venue: { id: 'df-01' },
    microclimateEntry: rpcEntry(),
    todMinutes: 18 * 60,
    now: AEST_DAY,
    getSunstayScoreResult: () => ({ score: 84, label: 'Peak Comfort' }),
  });

  assert.equal(resolveSunFraction(rpcEntry(), 18 * 60, AEST_DAY), 0);
  assert.equal(result.score, 0);
  assert.equal(result.unavailable, false);
});

test('prefers the RPC profile even while weather is still loading', () => {
  const result = resolveOverviewScore({
    loading: true,
    venue: { id: 'df-01' },
    microclimateEntry: rpcEntry(),
    todMinutes: 12 * 60,
    now: AEST_DAY,
    getSunstayScoreResult: () => ({ score: 84, label: 'Peak Comfort' }),
  });

  assert.equal(result.score, 100);
  assert.equal(result.loading, false);
  assert.equal(result.unavailable, false);
});

test('falls back to getSunstayScoreResult when the venue has no RPC profile', () => {
  const venue = { id: 'v1' };
  const result = resolveOverviewScore({
    loading: false,
    venue,
    microclimateEntry: { id: 'v1', sun_now: null, sun_hour_fraction: null },
    todMinutes: 14 * 60,
    now: AEST_DAY,
    getSunstayScoreResult: () => ({ score: 81, label: 'Peak Comfort' }),
  });

  assert.deepEqual(result, {
    score: 81,
    label: 'Peak Comfort',
    unavailable: false,
    loading: false,
  });
});
