import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MOBILE_VENUE_RENDER_LIMIT,
    parseVenueRenderLimit,
    sliceVenuesForRender,
} from './venueRenderLimit.js';

function venues(count) {
    return Array.from({ length: count }, (_, index) => ({ id: `v${index + 1}` }));
}

describe('venue render limit', () => {
    it('keeps the full filtered list when the limit is unset', () => {
        const all = venues(59);
        assert.equal(MOBILE_VENUE_RENDER_LIMIT, 59);
        assert.equal(parseVenueRenderLimit(null), null);
        assert.equal(parseVenueRenderLimit('all'), null);
        assert.equal(parseVenueRenderLimit('10'), null);
        assert.equal(sliceVenuesForRender(all, null), all);
        assert.equal(sliceVenuesForRender(all, parseVenueRenderLimit('all')).length, 59);
    });

    it('renders the initial experiment batches without dropping earlier venues', () => {
        const all = venues(59);
        for (const limit of [15, 30, 45, 59]) {
            const shown = sliceVenuesForRender(all, limit);
            assert.equal(shown.length, limit);
            assert.equal(shown[0].id, 'v1');
            assert.equal(shown[shown.length - 1].id, `v${limit}`);
            assert.equal(all.length, 59);
        }
    });

    it('applies after filtering and leaves an empty result empty', () => {
        const filtered = venues(40).filter((venue) => Number(venue.id.slice(1)) % 2 === 0);
        const shown = sliceVenuesForRender(filtered, 15);
        assert.equal(filtered.length, 20);
        assert.equal(shown.length, 15);
        assert.deepEqual(shown.map((venue) => venue.id), filtered.slice(0, 15).map((venue) => venue.id));
        assert.deepEqual(sliceVenuesForRender([], 15), []);
    });

    it('does not put the mascot indicator inside the venue slice', () => {
        const shown = sliceVenuesForRender(venues(59), 15);
        assert.equal(shown.every((venue) => venue && typeof venue.id === 'string'), true);
        assert.equal(shown.some((venue) => venue.slot === 'indicator'), false);
    });

    it('keeps a selected venue available outside the rendered slice', () => {
        const all = venues(59);
        const shown = sliceVenuesForRender(all, 15);
        const selected = all.find((venue) => venue.id === 'v40');
        assert.equal(shown.some((venue) => venue.id === selected.id), false);
        assert.equal(selected.id, 'v40');
    });
});
