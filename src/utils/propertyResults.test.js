import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homesEmptyState, includeNonStayResults } from './propertyResults.js';

const home = { id: 'home', typeCategory: 'Residential' };
const hotel = { id: 'hotel', typeCategory: 'Hotel' };
const apartment = { id: 'apartment', typeCategory: 'Serviced apartment' };

describe('mixed property results', () => {
    it('keeps homes after ranked stays, without duplicating or unranking stays', () => {
        const ranked = [{ ...apartment, minutes: 120 }, { ...hotel, minutes: 60 }];
        assert.deepEqual(includeNonStayResults([home, hotel, apartment], ranked), [...ranked, home]);
    });
    it('keeps all already-filtered non-stays, even when no stay is available', () => {
        const bar = { id: 'bar', typeCategory: 'Bar' };
        assert.deepEqual(includeNonStayResults([home, bar], []), [home, bar]);
        assert.deepEqual(includeNonStayResults([hotel], [{ ...hotel, minutes: 0 }]), [{ ...hotel, minutes: 0 }]);
    });
});

describe('Homes empty-state context', () => {
    it('explains missing residential inventory without blaming the search or promising future listings', () => {
        const state = homesEmptyState({ venues: [hotel, apartment], filters: ['all-homes'] });
        assert.equal(state.title, 'No homes in these listings');
        assert.equal(state.actionLabel, 'Browse all venues');
        assert.match(state.message, /Try Stays/);
    });
    it('distinguishes filtered-out homes from missing inventory, including normalized type variants', () => {
        const state = homesEmptyState({ venues: [{ ...home, typeCategory: ' residential ' }], filters: ['all-homes', 'Pet Friendly'] });
        assert.equal(state.title, 'No homes match this search');
        assert.equal(state.actionLabel, 'Clear filters');
    });
    it('does not announce missing homes before the venue lookup finishes', () => {
        const state = homesEmptyState({ venues: [hotel], filters: ['all-homes'], loading: true });
        assert.equal(state.badgeLabel, 'Loading listings');
        assert.equal(state.title, 'Checking for homes');
    });
    it('allows a food filter alongside Homes without mistaking it for a second property category', () => {
        assert.equal(homesEmptyState({ venues: [hotel], filters: ['all-homes', 'all-cafes'] }).title, 'No homes in these listings');
    });
    it('leaves other categories and mixed property selections on the existing empty state', () => {
        for (const filters of [[], ['all-stays'], ['all-homes', 'all-stays'], ['all-homes', 'all-bars']]) {
            assert.equal(homesEmptyState({ venues: [hotel], filters }), null);
        }
    });
});
