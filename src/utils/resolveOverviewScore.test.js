import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOverviewScore } from './resolveOverviewScore.js';

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
