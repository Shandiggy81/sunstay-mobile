import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VENUE_KINDS, venueKind } from './venueKind.js';

// Food and drink venues all carry typeCategory 'Bar' ("not a stay").
const food = (typeLabel, extra = {}) => ({ typeCategory: 'Bar', typeLabel, ...extra });

describe('venueKind: every label public.clue_venue_label() can produce', () => {
    // 20261016030000_clue_venue_labels_osm.sql (and the earlier rule in 20261016000000).
    const cases = [
        ['Cafe', 'cafe'],
        ['Bakery cafe', 'bakery'],
        ['Pub & bar', 'pub'],
        ['Cocktail & wine bar', 'bar'],
        ['Bar', 'bar'],
        ['Restaurant', 'restaurant'],
        ['Takeaway', 'takeaway'],
        // No kind of their own: a hotel's restaurant or bar, dessert, or no evidence.
        ['Hotel dining', 'other'],
        ['Gelato & dessert', 'other'],
        ['Eatery', 'other'],
    ];
    for (const [label, kind] of cases) {
        it(`${label} → ${kind}`, () => assert.equal(venueKind(food(label)), kind));
    }

    it('is never a bar just because typeCategory says Bar', () => {
        assert.equal(venueKind(food('Cafe')), 'cafe');
        assert.equal(venueKind(food('Bakery cafe')), 'bakery');
        assert.equal(venueKind(food(null)), 'other');
    });
});

describe('venueKind: curated labels in production', () => {
    const cases = [
        ['Cafe & Roastery', 'cafe'],
        ['Library Cafe', 'cafe'],
        ['Rooftop Bar', 'bar'],
        ['Bridge Bar', 'bar'],
        ['Floating Bar', 'bar'],
        ['Bar & Restaurant', 'bar'],
        ['Bistro & Bar', 'bar'],
        ['Polish Bar & Restaurant', 'bar'],
        ['Neighbourhood Pub', 'pub'],
        ['Pub & Restaurant', 'pub'],
        ['Pub & Dining Room', 'pub'],
        ['Tavern', 'pub'],
        ['Brewery & Beer Hall', 'pub'],
        ['Brewery Playground', 'pub'],
        ['Beer Hall & Thai', 'pub'],
        ['Riverside Beer Garden', 'pub'],
        ['Urban Pub & Beer Garden', 'pub'],
        ['Waterfront Restaurant', 'restaurant'],
        ['Southeast Asian Restaurant', 'restaurant'],
        ['Rooftop Club', 'other'],
        ['High-Exposure Rooftop', 'other'],
        ['Foreshore Pavilion', 'other'],
        ['Beach House Dining', 'other'],
    ];
    for (const [label, kind] of cases) {
        it(`${label} → ${kind}`, () => assert.equal(venueKind(food(label)), kind));
    }
});

describe('venueKind: odd input', () => {
    it('reads accents, casing and spacing the way the food filters do', () => {
        assert.equal(venueKind(food('Café')), 'cafe');
        assert.equal(venueKind(food('CAFE')), 'cafe');
        assert.equal(venueKind(food('  bakery   CAFÉ ')), 'bakery');
        assert.equal(venueKind(food('pub & BAR')), 'pub');
        assert.equal(venueKind(food('Take-away')), 'takeaway');
    });

    it('is other for a missing, empty or non-text label', () => {
        for (const label of [null, undefined, '', '   ', 42, {}]) {
            assert.equal(venueKind(food(label)), 'other');
        }
        assert.equal(venueKind(null), 'other');
        assert.equal(venueKind(undefined), 'other');
        assert.equal(venueKind({}), 'other');
    });

    it('never guesses from the name, vibe or emoji', () => {
        assert.equal(venueKind(food(null, { venueName: 'Pilgrim Bar', vibe: 'Wine bar', emoji: '🍸' })), 'other');
        assert.equal(venueKind(food(null, { venueName: 'Royal Oak Hotel' })), 'other');
        assert.equal(venueKind(food('Cafe', { venueName: 'Gordons Cafe and Bar' })), 'cafe');
    });
});

describe('venueKind: stays', () => {
    it('comes from typeCategory, whatever the label says', () => {
        assert.equal(venueKind({ typeCategory: 'Hotel', typeLabel: 'Boutique Hotel' }), 'stay');
        assert.equal(venueKind({ typeCategory: 'Serviced apartment', typeLabel: 'Serviced apartment' }), 'stay');
        assert.equal(venueKind({ typeCategory: 'hotel' }), 'stay');
        assert.equal(venueKind({ typeCategory: 'Short stay' }), 'stay');
        assert.equal(venueKind({ typeCategory: 'Hotel', typeLabel: 'Cafe' }), 'stay');
    });

    it('is not a stay for a hotel restaurant, a pub named Hotel, or a home', () => {
        assert.equal(venueKind(food('Hotel dining')), 'other');
        assert.equal(venueKind(food('Pub & bar', { venueName: 'Stags Head Hotel' })), 'pub');
        assert.equal(venueKind({ typeCategory: 'Residential', typeLabel: 'Residential' }), 'other');
    });
});

describe('VENUE_KINDS', () => {
    it('lists every kind venueKind returns', () => {
        assert.deepEqual([...VENUE_KINDS].sort(), ['bakery', 'bar', 'cafe', 'other', 'pub', 'restaurant', 'stay', 'takeaway']);
    });
});
