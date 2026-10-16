import test from 'node:test';
import assert from 'node:assert/strict';
import { venueTypeLabel } from './venueTypeLabel.js';

test('gives the exact Eatery category a neutral display label', () => {
    for (const label of ['Eatery', 'eatery', ' EATERY ']) {
        assert.equal(venueTypeLabel(label), 'Food & drink');
    }
});

test('preserves specific categories and venue descriptions containing Eatery', () => {
    for (const label of ['Restaurant', 'Cafe', 'Bakery cafe', 'Gelato & dessert', 'Cocktail & wine bar', 'Takeaway', 'Bar & Eatery', 'Eatery and bar', 'New category']) {
        assert.equal(venueTypeLabel(label), label);
    }
    assert.equal(venueTypeLabel('  Waterfront restaurant  '), 'Waterfront restaurant');
});

test('keeps missing labels empty so subtitles do not gain a made-up category', () => {
    for (const label of [null, undefined, '', '   ']) assert.equal(venueTypeLabel(label), '');
});
