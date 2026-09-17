import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canUsePointerTilt } from './canUsePointerTilt.js';

test('disables pointer-tilt when the device reports touch points', () => {
  const env = {
    navigator: { maxTouchPoints: 5 },
    matchMedia: () => ({ matches: true }),
  };
  assert.equal(canUsePointerTilt(env), false);
});

test('disables pointer-tilt when hover/fine pointer is unavailable', () => {
  const env = {
    navigator: { maxTouchPoints: 0 },
    matchMedia: (query) => ({
      matches: query !== '(hover: hover) and (pointer: fine)',
    }),
  };
  assert.equal(canUsePointerTilt(env), false);
});

test('enables pointer-tilt only for hover-capable fine pointers without touch', () => {
  const env = {
    navigator: { maxTouchPoints: 0 },
    matchMedia: (query) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
    }),
  };
  assert.equal(canUsePointerTilt(env), true);
});
