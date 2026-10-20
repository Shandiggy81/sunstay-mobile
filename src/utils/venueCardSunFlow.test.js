import test from 'node:test';
import assert from 'node:assert/strict';
import { venueCardSunSection } from './venueCardSunFlow.js';

test('rooms take priority over outdoor moments for a stay', () => {
  assert.equal(venueCardSunSection({ showStay: true, outdoorDay: {}, outdoorMoments: {} }), 'stay');
  assert.equal(venueCardSunSection({ showStay: { rooms: [] } }), 'stay');
});

test('outdoor moments replace the old timeline only with both data sets', () => {
  assert.equal(venueCardSunSection({ showStay: false, outdoorDay: {}, outdoorMoments: {} }), 'moments');
});

test('venues without rooms or complete moments retain Today’s sun', () => {
  for (const input of [{}, { outdoorDay: {} }, { outdoorMoments: {} }, { showStay: false, outdoorDay: null, outdoorMoments: null }]) {
    assert.equal(venueCardSunSection(input), 'today');
  }
});

test('cafés with sun moments get the café sun card; other venues are unchanged', () => {
  assert.equal(venueCardSunSection({ showStay: false, outdoorDay: {}, outdoorMoments: {}, cafe: true }), 'cafe');
  assert.equal(venueCardSunSection({ showStay: false, outdoorDay: {}, outdoorMoments: {}, cafe: false }), 'moments');
  assert.equal(venueCardSunSection({ showStay: true, outdoorDay: {}, outdoorMoments: {}, cafe: true }), 'stay');
  assert.equal(venueCardSunSection({ outdoorDay: null, outdoorMoments: null, cafe: true }), 'today');
});
