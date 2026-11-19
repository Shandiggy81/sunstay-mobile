import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_CARD_TYPES, venueSunCardType } from './venueSunCardType.js';
import { BEST_FOR_COPY } from './bestForMoment.js';
import { TILE_ORDER } from './cafeCardTiles.js';

const bar = (typeLabel, extra = {}) => ({ typeCategory: 'Bar', typeLabel, ...extra });

describe('venueSunCardType', () => {
    it('gives cafés and bakeries the café card', () => {
        for (const typeLabel of ['Cafe', 'Cafe & Roastery', 'Library Cafe', 'Bakery cafe']) {
            assert.equal(venueSunCardType(bar(typeLabel)), 'cafe', typeLabel);
        }
    });

    it('names the outdoor space from the venue’s own label', () => {
        for (const [typeLabel, type] of [
            ['Beer Garden', 'beer-garden'], ['Pub & Beer Garden', 'beer-garden'], ['Urban Pub & Beer Garden', 'beer-garden'],
            ['Riverside Beer Garden', 'beer-garden'], ['Biergarten', 'beer-garden'], ['beer gardens', 'beer-garden'],
            ['Rooftop Bar', 'rooftop'], ['Rooftop Club', 'rooftop'], ['High-Exposure Rooftop', 'rooftop'], ['Roof top terrace', 'rooftop'],
            ['Courtyard Bar', 'courtyard'], ['Wine bar & courtyard', 'courtyard'],
        ]) {
            assert.equal(venueSunCardType(bar(typeLabel)), type, typeLabel);
        }
    });

    it('calls a rooftop beer garden a rooftop', () => {
        assert.equal(venueSunCardType(bar('Rooftop Beer Garden')), 'rooftop');
    });

    it('keeps the generic sun moments when the label names no outdoor space', () => {
        for (const typeLabel of ['Classic Pub', 'Live Music Pub', 'Pub & bar', 'Cocktail & wine bar', 'Restaurant',
            'Warehouse & Garden', 'Floating Bar', 'Eatery', '', null, undefined]) {
            assert.equal(venueSunCardType(bar(typeLabel)), null, String(typeLabel));
        }
    });

    it('never reads the name, tags or vibe', () => {
        assert.equal(venueSunCardType(bar('Classic Pub', { venueName: 'The Rooftop Beer Garden', tags: ['Beer Garden', 'Rooftop'], vibe: 'Beer Garden' })), null);
        assert.equal(venueSunCardType(bar(null, { venueName: 'Courtyard Cafe' })), null);
    });

    it('never types a stay or a home', () => {
        assert.equal(venueSunCardType({ typeCategory: 'Hotel', typeLabel: 'Rooftop Bar' }), null);
        assert.equal(venueSunCardType({ typeCategory: 'Serviced apartment', typeLabel: 'Beer Garden' }), null);
        assert.equal(venueSunCardType({ typeCategory: 'Residential', typeLabel: 'Courtyard' }), null);
        assert.equal(venueSunCardType(null), null);
    });

    it('has a headline, best-for copy and a tile order for every type it returns', () => {
        for (const type of ['cafe', 'rooftop', 'beer-garden', 'courtyard']) {
            assert.ok(SUN_CARD_TYPES[type]?.title.endsWith(' Sun'), type);
            assert.ok(SUN_CARD_TYPES[type]?.factsLabel, type);
            assert.deepEqual(Object.keys(BEST_FOR_COPY[type]).sort(), ['afternoon', 'coffee', 'lunch', 'sunset'], type);
            assert.ok(TILE_ORDER[type]?.length > 0, type);
        }
        assert.deepEqual([SUN_CARD_TYPES.rooftop.title, SUN_CARD_TYPES['beer-garden'].title, SUN_CARD_TYPES.courtyard.title],
            ['Rooftop Sun', 'Beer Garden Sun', 'Courtyard Sun']);
    });
});
