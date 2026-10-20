import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_CATEGORIES } from '../data/demoVenues.js';
import { DISCOVERY_EXPERIENCES } from './discoveryExperience.js';
import { AMENITY_FILTER_IDS, APP_FILTER_IDS, canonicalFilterId, FILTER_COZY, FILTER_SUNNY } from './filterIds.js';
import { PROPERTY_FILTERS } from './propertyTypes.js';
import { SUN_MOMENT_FILTERS } from './sunMomentFilters.js';
import { FOOD_TYPE_FILTERS } from './venueFoodType.js';

describe('APP_FILTER_IDS', () => {
    it('holds every id the filter sheet, quick chips and presets can set', () => {
        const ids = new Set(APP_FILTER_IDS);
        const sources = [
            ...FILTER_CATEGORIES, ...FOOD_TYPE_FILTERS, ...PROPERTY_FILTERS, ...SUN_MOMENT_FILTERS,
        ].map((f) => f.id);
        for (const id of [...sources, FILTER_SUNNY, FILTER_COZY, ...DISCOVERY_EXPERIENCES.flatMap((e) => e.filters)]) {
            assert.ok(ids.has(id), id);
        }
        assert.equal(ids.size, APP_FILTER_IDS.length);
    });

    it('has no ids nothing in the app can set', () => {
        for (const id of ['all-bars', 'all-hotels', 'sun-morning', 'Hidden gem']) {
            assert.equal(APP_FILTER_IDS.includes(id), false, id);
        }
    });
});

describe('canonicalFilterId', () => {
    it('returns the app spelling, ignoring case and outer space', () => {
        assert.equal(canonicalFilterId('Rooftop'), 'Rooftop');
        assert.equal(canonicalFilterId('  PET friendly '), 'Pet Friendly');
        assert.equal(canonicalFilterId('MOMENT-COFFEE'), 'moment-coffee');
        assert.equal(canonicalFilterId('Pram friendly'), 'Pram Friendly');
    });

    it('accepts the key amenity labels Sunny sees on venues', () => {
        assert.deepEqual(AMENITY_FILTER_IDS, ['Wheelchair accessible', 'Pram friendly', 'Dog friendly', 'Hidden gem']);
        assert.equal(canonicalFilterId('hidden gem'), 'Hidden gem');
        assert.equal(canonicalFilterId('Dog friendly'), 'Dog friendly');
        assert.equal(canonicalFilterId('Wheelchair accessible'), 'Wheelchair Accessible');
    });

    it('is null for anything else', () => {
        for (const id of ['all-bars', 'all-hotels', 'sun-morning', 'Rooftop bars', '', '  ', null, undefined, 7, {}]) {
            assert.equal(canonicalFilterId(id), null, String(id));
        }
    });
});
