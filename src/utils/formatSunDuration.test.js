import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSunDuration } from './formatSunDuration.js';

test('formats sun minutes as compact hours and minutes', () => {
  assert.equal(formatSunDuration(567), '9h 27m');
  assert.equal(formatSunDuration(60), '1h');
  assert.equal(formatSunDuration(45), '45m');
  assert.equal(formatSunDuration(0), '0m');
});

test('rounds fractional minutes and rejects unusable durations safely', () => {
  assert.equal(formatSunDuration(90.6), '1h 31m');
  assert.equal(formatSunDuration(-10), '0m');
  assert.equal(formatSunDuration(null), 'Unavailable');
  assert.equal(formatSunDuration(''), 'Unavailable');
  assert.equal(formatSunDuration(undefined), 'Unavailable');
  assert.equal(formatSunDuration('not-a-duration'), 'Unavailable');
});
