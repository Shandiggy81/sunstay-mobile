import test from 'node:test';
import assert from 'node:assert';
import { checkIsAccommodation } from './accommodation.js';

test('checkIsAccommodation logic', async (t) => {
    await t.test('returns true for hotels based on vibe', () => {
        const venue = { vibe: 'boutique hotel', type: '' };
        assert.equal(checkIsAccommodation(venue), true);
    });

    await t.test('returns false for standard bars with no type', () => {
        const venue = { vibe: 'rooftop', type: '' };
        assert.equal(checkIsAccommodation(venue), false);
    });

    await t.test('returns false for standard bars with a type field', () => {
        const venue = { vibe: 'rooftop', type: 'Bar' };
        // This fails initially due to the bug (early return true if type.length > 0)
        assert.equal(checkIsAccommodation(venue), false);
    });

    await t.test('returns true if type contains accommodation keywords', () => {
        const venue = { vibe: 'rooftop', type: 'hotel' };
        assert.equal(checkIsAccommodation(venue), true);
    });

    await t.test('returns false for substring matches like "dinner" containing "inn"', () => {
        const venue = { vibe: 'dinner club', type: 'restaurant' };
        assert.equal(checkIsAccommodation(venue), false);
    });

    await t.test('defensive behavior against edge cases', () => {
        assert.equal(checkIsAccommodation(null), false);
        assert.equal(checkIsAccommodation(undefined), false);
        assert.equal(checkIsAccommodation({}), false);
        assert.equal(checkIsAccommodation({ type: null, vibe: null }), false);
        assert.equal(checkIsAccommodation({ type: "HOTEL" }), true);
    });
});
