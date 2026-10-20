import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cafeCardTiles, CAFE_TYPE_LABELS, isCafeVenue, MAX_CAFE_TILES, WIND_SHELTERED_MIN_SCORE } from './cafeCardTiles.js';

const NOW = Date.parse('2026-10-20T02:00:00Z');
const MINUTE = 60_000;
const fresh = (score) => ({ wind_shelter_score: score, weather_computed_at: new Date(NOW - 10 * MINUTE).toISOString() });
const CLUE_CAFE = { id: 'clue-1', typeLabel: 'Cafe', data_source: 'clue', outdoor_seats: 24, tags: ['Outdoor Seating'] };
const keys = (tiles) => tiles.map((t) => t.key);

describe('isCafeVenue', () => {
    it("is true only for the CLUE café labels", () => {
        assert.deepEqual([...CAFE_TYPE_LABELS], ['Cafe', 'Bakery cafe']);
        assert.ok(isCafeVenue({ typeLabel: 'Cafe' }));
        assert.ok(isCafeVenue({ typeLabel: 'Bakery cafe' }));
        for (const typeLabel of ['Cafe & Roastery', 'Library Cafe', 'cafe', 'Pub & bar', undefined]) {
            assert.equal(isCafeVenue({ typeLabel }), false);
        }
        assert.equal(isCafeVenue(null), false);
    });
});

describe('cafeCardTiles', () => {
    it('shows outdoor tables from CLUE seats and wind shelter from a fresh reading', () => {
        assert.deepEqual(cafeCardTiles(CLUE_CAFE, { microclimate: fresh(0.7), now: NOW }), [
            { key: 'outdoor-tables', label: 'Outdoor tables', icon: 'garden-table', detail: '24 outdoor seats · City of Melbourne CLUE', kind: null },
            { key: 'wind-sheltered', label: 'Wind-sheltered', icon: 'wind-sheltered', detail: 'From the current wind direction', kind: 'estimated' },
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

    it('reads heaters and fireplaces from the static venue fields', () => {
        const tiles = (venue) => cafeCardTiles({ typeLabel: 'Cafe', ...venue }, { now: NOW });
        assert.deepEqual(tiles({ heating: 'heated outdoor' }).map((t) => t.label), ['Outdoor heaters']);
        assert.deepEqual(tiles({ heating: 'indoor only' }), []);
        assert.deepEqual(tiles({ heating: 'no heating', tags: ['Heaters'] }).map((t) => t.label), ['Heaters']);
        for (const venue of [{ heating: 'traditional-fireplace' }, { hasFireplace: true }, { tags: ['fireplace'] }]) {
            assert.deepEqual(keys(tiles(venue)), ['fireplace']);
        }
    });

    it('keeps the brief order and at most four tiles', () => {
        assert.equal(MAX_CAFE_TILES, 4);
        const venue = {
            ...CLUE_CAFE, heating: 'heated outdoor fireplace',
            dog_friendly: true, dog_friendly_source: 'venue-confirmed', pram_friendly: true, pram_friendly_source: 'venue-confirmed',
        };
        assert.deepEqual(keys(cafeCardTiles(venue, { microclimate: fresh(0.8), now: NOW })),
            ['outdoor-tables', 'dog-friendly', 'pram-friendly', 'wind-sheltered']);
        assert.deepEqual(keys(cafeCardTiles({ ...CLUE_CAFE, heating: 'heated outdoor fireplace' }, { microclimate: fresh(0.8), now: NOW })),
            ['outdoor-tables', 'wind-sheltered', 'heaters', 'fireplace']);
    });

    it('only names clay icons that exist', () => {
        const venue = {
            ...CLUE_CAFE, heating: 'heated outdoor', hasFireplace: true,
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
