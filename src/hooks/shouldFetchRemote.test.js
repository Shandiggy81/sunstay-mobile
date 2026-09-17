import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldFetchRemote } from './shouldFetchRemote.js';

test('does not fetch AQ/UV/Tomorrow until the forecast section is enabled', () => {
  assert.equal(shouldFetchRemote({ enabled: false, lat: -37.81, lng: 144.96 }), false);
});

test('fetches only with valid coordinates after forecast is enabled', () => {
  assert.equal(shouldFetchRemote({ enabled: true, lat: -37.81, lng: 144.96 }), true);
  assert.equal(shouldFetchRemote({ enabled: true, lat: null, lng: 144.96 }), false);
  assert.equal(shouldFetchRemote({ enabled: true, lat: -37.81, lng: undefined }), false);
});
