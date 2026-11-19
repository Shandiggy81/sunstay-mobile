import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cafeCardTiles, isCafeVenue, MAX_CAFE_TILES, TILE_ORDER, venueSunCardTiles, WIND_SHELTERED_MIN_SCORE } from './cafeCardTiles.js';

const NOW = Date.parse('2026-10-20T02:00:00Z');
const MINUTE = 60_000;
const fresh = (score) => ({ wind_shelter_score: score, weather_computed_at: new Date(NOW - 10 * MINUTE).toISOString() });
const CLUE_CAFE = { id: 'clue-1', typeLabel: 'Cafe', data_source: 'clue', outdoor_seats: 24, tags: ['Outdoor Seating'] };
const keys = (tiles) => tiles.map((t) => t.key);

describe('isCafeVenue', () => {
    it('is true for every café or bakery label, CLUE or curated', () => {
        for (const typeLabel of ['Cafe', 'Bakery cafe', 'Cafe & Roastery', 'Library Cafe']) {
            assert.equal(isCafeVenue({ typeCategory: 'Bar', typeLabel }), true, typeLabel);
        }
    });

    it('reads odd casing, accents and spacing', () => {
        for (const typeLabel of ['cafe', 'CAFE', 'Café', '  bakery   CAFÉ ']) {
            assert.equal(isCafeVenue({ typeCategory: 'Bar', typeLabel }), true, typeLabel);
        }
    });

    it('is false for other kinds, no label and stays', () => {
        for (const typeLabel of ['Pub & bar', 'Cocktail & wine bar', 'Restaurant', 'Takeaway', 'Eatery', 'Hotel dining', null, undefined, '']) {
            assert.equal(isCafeVenue({ typeCategory: 'Bar', typeLabel }), false, String(typeLabel));
        }
        assert.equal(isCafeVenue({ typeCategory: 'Hotel', typeLabel: 'Cafe' }), false);
        assert.equal(isCafeVenue({ typeCategory: 'Serviced apartment', typeLabel: 'Bakery cafe' }), false);
        assert.equal(isCafeVenue(null), false);
    });

    it('never comes from the name', () => {
        assert.equal(isCafeVenue({ typeCategory: 'Bar', typeLabel: null, venueName: 'Lion and Wombat Cafe' }), false);
        assert.equal(isCafeVenue({ typeCategory: 'Bar', typeLabel: 'Pub & bar', venueName: 'Asian Beer Cafe' }), false);
        assert.equal(isCafeVenue({ typeCategory: 'Bar', typeLabel: 'Restaurant', venueName: 'Achelya Cafe & Kebab Restaurant' }), false);
    });
});

describe('cafeCardTiles', () => {
    it('shows outdoor tables from CLUE seats and wind shelter from a fresh reading', () => {
        assert.deepEqual(cafeCardTiles(CLUE_CAFE, { microclimate: fresh(0.7), now: NOW }), [
            { key: 'outdoor-tables', label: 'Outdoor tables', icon: 'garden-table', detail: '24 outdoor seats · City of Melbourne CLUE', kind: null },
            { key: 'wind-sheltered', label: "Sheltered from today's wind", icon: 'wind-sheltered', detail: 'Depends on the wind direction', kind: 'estimated' },
        ]);
    });

    it('needs a positive whole seat count', () => {
        for (const outdoor_seats of [0, -3, null, undefined, 2.5, 'many']) {
            assert.deepEqual(keys(cafeCardTiles({ ...CLUE_CAFE, outdoor_seats }, { now: NOW })), []);
        }
        assert.equal(cafeCardTiles({ ...CLUE_CAFE, outdoor_seats: 1 }, { now: NOW })[0].detail, '1 outdoor seat · City of Melbourne CLUE');
        assert.equal(cafeCardTiles({ ...CLUE_CAFE, data_source: null }, { now: NOW })[0].detail, '24 outdoor seats');
    });

    it('shows wind shelter only at or above the threshold, in range and fresh', () => {
        assert.equal(WIND_SHELTERED_MIN_SCORE, 0.6);
        const wind = (microclimate) => keys(cafeCardTiles(CLUE_CAFE, { microclimate, now: NOW })).includes('wind-sheltered');
        assert.equal(wind(fresh(0.6)), true);
        assert.equal(wind(fresh(0.59)), false);
        assert.equal(wind(fresh(1.2)), false);
        assert.equal(wind(fresh('0.9')), false);
        assert.equal(wind({ wind_shelter_score: 0.9, weather_computed_at: new Date(NOW - 90 * MINUTE).toISOString() }), false);
        assert.equal(wind({ wind_shelter_score: 0.9 }), false);
        assert.equal(wind(null), false);
    });

    it('never shows dog or pram tiles from demo tags, names or vibes', () => {
        const venue = {
            ...CLUE_CAFE, venueName: 'Sunny Dog Cafe', vibe: 'dog-friendly garden, prams welcome',
            tags: ['Pet Friendly', 'dog-friendly', 'Pram Friendly'], dog_friendly: true, pram_friendly: true,
        };
        assert.deepEqual(keys(cafeCardTiles(venue, { now: NOW })), ['outdoor-tables']);
    });

    it('is ready for sourced dog and pram fields once they exist', () => {
        const venue = { ...CLUE_CAFE, dog_friendly: true, dog_friendly_source: 'venue-confirmed', pram_friendly: true, pram_friendly_source: 'venue-confirmed' };
        assert.deepEqual(keys(cafeCardTiles(venue, { now: NOW })), ['outdoor-tables', 'dog-friendly', 'pram-friendly']);
    });

    it('holds heaters and fireplaces to the same sourced-record standard as dog and pram', () => {
        const tiles = (venue) => cafeCardTiles({ typeLabel: 'Cafe', ...venue }, { now: NOW });
        for (const unsourced of [
            { heating: 'heated outdoor' }, { heating: 'traditional-fireplace' }, { hasFireplace: true },
            { tags: ['Heaters', 'Fireplace'] }, { heatersOn: true, fireplaceOn: true },
            { outdoor_heaters: true }, { fireplace: true, fireplace_source: '  ' },
        ]) {
            assert.deepEqual(tiles(unsourced), [], JSON.stringify(unsourced));
        }
        assert.deepEqual(
            tiles({ outdoor_heaters: true, outdoor_heaters_source: 'venue-confirmed', fireplace: true, fireplace_source: 'venue-confirmed' })
                .map((t) => [t.key, t.label, t.icon]),
            [['heaters', 'Outdoor heaters', 'heater'], ['fireplace', 'Fireplace', 'fireplace']],
        );
    });

    it('keeps the brief order and at most four tiles', () => {
        assert.equal(MAX_CAFE_TILES, 4);
        const warm = { outdoor_heaters: true, outdoor_heaters_source: 'venue-confirmed', fireplace: true, fireplace_source: 'venue-confirmed' };
        const venue = {
            ...CLUE_CAFE, ...warm,
            dog_friendly: true, dog_friendly_source: 'venue-confirmed', pram_friendly: true, pram_friendly_source: 'venue-confirmed',
        };
        assert.deepEqual(keys(cafeCardTiles(venue, { microclimate: fresh(0.8), now: NOW })),
            ['outdoor-tables', 'dog-friendly', 'pram-friendly', 'wind-sheltered']);
        assert.deepEqual(keys(cafeCardTiles({ ...CLUE_CAFE, ...warm }, { microclimate: fresh(0.8), now: NOW })),
            ['outdoor-tables', 'wind-sheltered', 'heaters', 'fireplace']);
    });

    it('only names clay icons that exist', () => {
        const venue = {
            ...CLUE_CAFE, outdoor_heaters: true, outdoor_heaters_source: 'x', fireplace: true, fireplace_source: 'x',
            dog_friendly: true, dog_friendly_source: 'x', pram_friendly: true, pram_friendly_source: 'x',
        };
        const all = [
            ...cafeCardTiles(venue, { microclimate: fresh(0.9), now: NOW }),
            ...cafeCardTiles({ ...venue, outdoor_seats: 0, dog_friendly: false, pram_friendly: false }, { now: NOW }),
        ];
        assert.equal(new Set(all.map((t) => t.key)).size, 6);
        for (const tile of all) {
            assert.ok(existsSync(new URL(`../assets/clay/${tile.icon}.webp`, import.meta.url)), tile.icon);
        }
    });

    it('returns nothing without a venue', () => {
        assert.deepEqual(cafeCardTiles(null), []);
    });
});

describe('venueSunCardTiles (stage 5 card types)', () => {
    const sourced = {
        covered_outdoor_seating: true, covered_outdoor_seating_source: 'venue-confirmed',
        dog_friendly: true, dog_friendly_source: 'venue-confirmed', pram_friendly: true, pram_friendly_source: 'venue-confirmed',
        outdoor_heaters: true, outdoor_heaters_source: 'venue-confirmed', fireplace: true, fireplace_source: 'venue-confirmed',
    };
    const tiles = (type, venue, microclimate = null) => keys(venueSunCardTiles({ typeCategory: 'Bar', ...venue }, { type, microclimate, now: NOW }));

    it('names the space the card is for, and nothing unsourced', () => {
        assert.deepEqual(tiles('beer-garden', { typeLabel: 'Beer Garden', tags: ['Pet Friendly', 'Heaters', 'Covered'], heating: 'heated outdoor' }), ['beer-garden']);
        assert.deepEqual(tiles('rooftop', { typeLabel: 'Rooftop Bar', tags: ['Views', 'Heaters'] }), ['rooftop']);
        assert.deepEqual(tiles('courtyard', { typeLabel: 'Courtyard Bar', hasFireplace: true, tags: ['Fireplace'] }), []);
    });

    it('keeps the brief’s order per type and at most four', () => {
        const all = { ...sourced, outdoor_seats: 40 };
        assert.deepEqual(tiles('beer-garden', all, fresh(0.9)), ['beer-garden', 'covered', 'dog-friendly', 'heaters']);
        assert.deepEqual(tiles('rooftop', all, fresh(0.9)), ['rooftop', 'wind-sheltered', 'heaters']);
        assert.deepEqual(tiles('courtyard', all, fresh(0.9)), ['heaters', 'fireplace', 'wind-sheltered', 'covered']);
        assert.deepEqual(tiles('cafe', all, fresh(0.9)), ['outdoor-tables', 'dog-friendly', 'pram-friendly', 'wind-sheltered']);
        for (const order of Object.values(TILE_ORDER)) assert.ok(order.length <= 6);
    });

    it('needs a fresh, high wind-shelter reading on rooftops and courtyards too', () => {
        assert.deepEqual(tiles('rooftop', {}, fresh(0.59)), ['rooftop']);
        assert.deepEqual(tiles('courtyard', {}, { wind_shelter_score: 0.9 }), []);
        assert.deepEqual(tiles('courtyard', {}, fresh(0.6)), ['wind-sheltered']);
    });

    it('gives the café card exactly what cafeCardTiles gives', () => {
        const venue = { ...CLUE_CAFE, ...sourced };
        assert.deepEqual(venueSunCardTiles(venue, { type: 'cafe', microclimate: fresh(0.8), now: NOW }), cafeCardTiles(venue, { microclimate: fresh(0.8), now: NOW }));
    });

    it('returns nothing for an unknown type or no venue', () => {
        assert.deepEqual(venueSunCardTiles({ typeLabel: 'Classic Pub', ...sourced }, { type: 'pub', now: NOW }), []);
        assert.deepEqual(venueSunCardTiles(null, { type: 'rooftop' }), []);
    });

    it('only names clay icons that exist', () => {
        const all = { ...sourced, outdoor_seats: 12 };
        for (const type of Object.keys(TILE_ORDER)) {
            for (const tile of venueSunCardTiles(all, { type, microclimate: fresh(0.9), now: NOW })) {
                assert.ok(existsSync(new URL(`../assets/clay/${tile.icon}.webp`, import.meta.url)), `${type}: ${tile.icon}`);
            }
        }
    });
});
