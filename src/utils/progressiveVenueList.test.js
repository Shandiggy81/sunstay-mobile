import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    INITIAL_VISIBLE_VENUES,
    VENUES_PER_LOAD,
    activateLoadMore,
    isLoadMoreKeyboardKey,
    projectVenueList,
    reduceProgressiveSession,
    resultCountLabel,
    startProgressiveSession,
    venueResultIdentity,
} from './progressiveVenueList.js';

function venues(count, prefix = 'v') {
    return Array.from({ length: count }, (_, index) => ({
        id: `${prefix}${index + 1}`,
        venueName: `${prefix} ${index + 1}`,
    }));
}

function ids(list) {
    return list.map((venue) => venue.id);
}

describe('progressive venue list', () => {
    it('initially renders at most 15 cards', () => {
        assert.equal(INITIAL_VISIBLE_VENUES, 15);
        assert.equal(VENUES_PER_LOAD, 15);
        const session = startProgressiveSession(venues(48));
        assert.equal(session.visibleVenues.length, 15);
        assert.deepEqual(ids(session.visibleVenues), ids(venues(48)).slice(0, 15));
        assert.equal(session.showLoadMore, true);
    });

    it('keeps the full result count visible', () => {
        const session = startProgressiveSession(venues(59));
        assert.equal(session.resultCount, 59);
        assert.equal(session.visibleVenues.length, 15);
        assert.equal(session.countLabel, '59 results');
        assert.equal(resultCountLabel(session.resultCount), '59 results');
        assert.notEqual(session.countLabel, resultCountLabel(session.visibleVenues.length));
    });

    it('Load More appends exactly the next 15 cards', () => {
        const first = startProgressiveSession(venues(48));
        const second = reduceProgressiveSession(first, { type: 'load-more' });
        assert.equal(second.visibleVenues.length, 30);
        assert.deepEqual(ids(second.visibleVenues), ids(venues(48)).slice(0, 30));
        assert.deepEqual(ids(second.visibleVenues).slice(0, 15), ids(first.visibleVenues));
    });

    it('hides Load More when every result is rendered', () => {
        let session = startProgressiveSession(venues(48));
        while (session.showLoadMore) {
            session = reduceProgressiveSession(session, { type: 'load-more' });
        }
        assert.equal(session.visibleVenues.length, 48);
        assert.equal(session.hasMoreVenues, false);
        assert.equal(session.showLoadMore, false);
        assert.equal(session.resultCount, 48);
    });

    it('does not duplicate cards when Load More is activated repeatedly', () => {
        let session = startProgressiveSession(venues(40));
        for (let i = 0; i < 8; i += 1) {
            session = reduceProgressiveSession(session, { type: 'load-more' });
        }
        const shown = ids(session.visibleVenues);
        assert.equal(shown.length, 40);
        assert.equal(new Set(shown).size, 40);
        assert.deepEqual(shown, ids(venues(40)));
    });

    it('resets the visible count to 15 when search changes the result set', () => {
        let session = reduceProgressiveSession(startProgressiveSession(venues(48)), { type: 'load-more' });
        assert.equal(session.visibleVenues.length, 30);
        const searched = venues(48).filter((venue) => Number(venue.id.slice(1)) <= 22);
        session = reduceProgressiveSession(session, { type: 'search', venues: searched });
        assert.equal(session.window.visibleCount, INITIAL_VISIBLE_VENUES);
        assert.equal(session.visibleVenues.length, 15);
        assert.equal(session.resultCount, 22);
        assert.equal(session.countLabel, '22 results');
    });

    it('resets the visible count to 15 when filters change the result set', () => {
        let session = reduceProgressiveSession(startProgressiveSession(venues(48)), { type: 'load-more' });
        const filtered = venues(48).slice(10, 40);
        session = reduceProgressiveSession(session, { type: 'filter', venues: filtered });
        assert.equal(session.window.visibleCount, 15);
        assert.equal(session.visibleVenues.length, 15);
        assert.equal(session.visibleVenues[0].id, 'v11');
        assert.equal(session.resultCount, 30);
    });

    it('does not duplicate cards when a refresh returns the same results', () => {
        let session = reduceProgressiveSession(startProgressiveSession(venues(36)), { type: 'load-more' });
        assert.equal(session.visibleVenues.length, 30);
        const refreshed = venues(36).map((venue) => ({ ...venue }));
        assert.equal(venueResultIdentity(refreshed), session.window.identity);
        session = reduceProgressiveSession(session, { type: 'refresh', venues: refreshed });
        const shown = ids(session.visibleVenues);
        assert.equal(session.window.visibleCount, 30);
        assert.equal(shown.length, 30);
        assert.equal(new Set(shown).size, 30);
        assert.deepEqual(shown, ids(venues(36)).slice(0, 30));
    });

    it('renders an empty result without a Load More button', () => {
        const session = startProgressiveSession([]);
        assert.equal(session.visibleVenues.length, 0);
        assert.equal(session.resultCount, 0);
        assert.equal(session.showLoadMore, false);
        assert.equal(session.countLabel, '0 results');
    });

    it('renders fewer than 15 results without a Load More button', () => {
        const session = startProgressiveSession(venues(7));
        assert.equal(session.visibleVenues.length, 7);
        assert.equal(session.resultCount, 7);
        assert.equal(session.showLoadMore, false);
        assert.equal(session.countLabel, '7 results');
    });

    it('treats keyboard activation as one Load More step', () => {
        assert.equal(isLoadMoreKeyboardKey('Enter'), true);
        assert.equal(isLoadMoreKeyboardKey(' '), true);
        assert.equal(isLoadMoreKeyboardKey('Spacebar'), true);
        assert.equal(isLoadMoreKeyboardKey('Tab'), false);
        const start = startProgressiveSession(venues(48));
        const fromKey = reduceProgressiveSession(start, { type: 'keyboard' });
        const fromClick = activateLoadMore(start.window, start.venues);
        assert.equal(fromKey.visibleVenues.length, 30);
        assert.equal(fromClick.visibleCount, fromKey.window.visibleCount);
        const again = reduceProgressiveSession(fromKey, { type: 'keyboard' });
        assert.equal(again.visibleVenues.length, 45);
        assert.equal(new Set(ids(again.visibleVenues)).size, 45);
    });

    it('keeps venue selection working before and after Load More', () => {
        const source = venues(48);
        let session = reduceProgressiveSession(startProgressiveSession(source), {
            type: 'select',
            id: 'v3',
        });
        assert.equal(session.selection.open, true);
        assert.equal(session.selection.selected.id, 'v3');
        assert.equal(venueSelectionOutside(session, 'v20'), false);

        session = reduceProgressiveSession(session, { type: 'load-more' });
        assert.equal(session.selectedId, 'v3');
        assert.equal(session.selection.open, true);
        assert.equal(session.selection.selected.id, 'v3');

        session = reduceProgressiveSession(session, { type: 'select', id: 'v20' });
        assert.equal(session.selection.open, true);
        assert.equal(session.selection.selected.id, 'v20');
        assert.equal(session.visibleVenues.length, 30);
    });

    it('does not reset the window when the same venues are only reordered', () => {
        let session = reduceProgressiveSession(startProgressiveSession(venues(20)), { type: 'load-more' });
        const reordered = [...venues(20)].reverse();
        session = reduceProgressiveSession(session, { type: 'reorder', venues: reordered });
        assert.equal(session.window.visibleCount, 30);
        assert.equal(session.showLoadMore, false);
        assert.equal(session.visibleVenues.length, 20);
    });

    it('keeps diagnostic venueLimit separate from the progressive window', () => {
        const source = venues(48);
        const cap = projectVenueList(source, { mode: 'diagnostic-cap', visibleCount: 45, cap: 15 });
        assert.equal(cap.visibleVenues.length, 15);
        assert.equal(cap.resultCount, 48);
        assert.equal(cap.showLoadMore, false);

        const all = projectVenueList(source, { mode: 'diagnostic-all', visibleCount: 15 });
        assert.equal(all.visibleVenues.length, 48);
        assert.equal(all.showLoadMore, false);

        let session = startProgressiveSession(source, { mode: 'diagnostic-cap', cap: 30 });
        session = reduceProgressiveSession(session, { type: 'load-more' });
        session = reduceProgressiveSession(session, { type: 'keyboard' });
        assert.equal(session.visibleVenues.length, 30);
        assert.equal(session.showLoadMore, false);
        assert.equal(session.resultCount, 48);
    });
});

function venueSelectionOutside(session, id) {
    return session.visibleVenues.some((venue) => venue.id === id);
}
