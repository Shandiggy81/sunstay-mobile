/**
 * Product venue-list window. Diagnostic `venueLimit` is applied separately
 * and must not be folded into this count.
 *
 * The window stores a count, then slices the current filtered/sorted array.
 * It never copies venues into a second list, so a refresh that returns the
 * same ids cannot duplicate cards.
 */

export const INITIAL_VISIBLE_VENUES = 15;
export const VENUES_PER_LOAD = 15;

/** Membership key. Order changes (score re-rank) do not reset the window. */
export function venueResultIdentity(venues) {
    if (!Array.isArray(venues) || venues.length === 0) return '';
    return venues
        .map((venue) => String(venue?.id ?? ''))
        .sort()
        .join('\0');
}

export function createVenueWindow(venues) {
    return {
        identity: venueResultIdentity(venues),
        visibleCount: INITIAL_VISIBLE_VENUES,
    };
}

/**
 * Reset to the initial page only when the filtered result set changes.
 * An unchanged refresh, a parent re-render, or a score reorder keeps the count.
 */
export function syncVenueWindow(windowState, venues) {
    const identity = venueResultIdentity(venues);
    const current = windowState ?? createVenueWindow(venues);
    if (current.identity === identity) return current;
    return { identity, visibleCount: INITIAL_VISIBLE_VENUES };
}

export function loadMoreVenues(windowState) {
    const current = windowState ?? createVenueWindow([]);
    return {
        ...current,
        visibleCount: current.visibleCount + VENUES_PER_LOAD,
    };
}

/**
 * Click, Enter, and Space share this path. Call it once per activation.
 * A native button already turns Enter/Space into one click.
 */
export function activateLoadMore(windowState, venues) {
    const synced = syncVenueWindow(windowState, venues);
    if (synced.visibleCount >= (Array.isArray(venues) ? venues.length : 0)) return synced;
    return loadMoreVenues(synced);
}

export function isLoadMoreKeyboardKey(key) {
    return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

export function projectProgressiveVenues(venues, visibleCount) {
    const list = Array.isArray(venues) ? venues : [];
    const count = Number.isFinite(visibleCount) ? visibleCount : INITIAL_VISIBLE_VENUES;
    const visibleVenues = list.slice(0, count);
    return {
        visibleVenues,
        hasMoreVenues: count < list.length,
        resultCount: list.length,
    };
}

/**
 * mode: 'progressive' | 'diagnostic-cap' | 'diagnostic-all'
 * Diagnostic caps never show Load more. Product mode slices by visibleCount.
 */
export function projectVenueList(venues, { mode = 'progressive', visibleCount = INITIAL_VISIBLE_VENUES, cap = null } = {}) {
    const list = Array.isArray(venues) ? venues : [];
    if (mode === 'diagnostic-all') {
        return {
            visibleVenues: list,
            hasMoreVenues: false,
            resultCount: list.length,
            showLoadMore: false,
        };
    }
    if (mode === 'diagnostic-cap') {
        const limit = Number.isInteger(cap) && cap >= 0 ? cap : list.length;
        return {
            visibleVenues: list.slice(0, limit),
            hasMoreVenues: false,
            resultCount: list.length,
            showLoadMore: false,
        };
    }
    const projected = projectProgressiveVenues(list, visibleCount);
    return { ...projected, showLoadMore: projected.hasMoreVenues };
}

export function resultCountLabel(resultCount) {
    const count = Number(resultCount) || 0;
    return `${count} result${count === 1 ? '' : 's'}`;
}

/** Selection reads the projected window and is not cleared by Load more. */
export function venueSelectionState(visibleVenues, selectedId) {
    if (selectedId == null) return { selected: null, open: false };
    const selected = (visibleVenues || []).find((venue) => venue.id === selectedId) ?? null;
    return { selected, open: selected != null };
}

export function reduceProgressiveSession(session, action) {
    const venues = action.venues ?? session.venues;
    const mode = action.mode ?? session.mode ?? 'progressive';
    const cap = action.cap ?? session.cap ?? null;
    let windowState = syncVenueWindow(session.window, venues);
    if ((action.type === 'load-more' || action.type === 'keyboard') && mode === 'progressive') {
        windowState = activateLoadMore(windowState, venues);
    }
    const projection = projectVenueList(venues, {
        mode,
        visibleCount: windowState.visibleCount,
        cap,
    });
    const selectedId = action.type === 'select'
        ? action.id
        : (action.type === 'clear-selection' ? null : session.selectedId ?? null);
    return {
        venues,
        window: windowState,
        mode,
        cap,
        selectedId,
        ...projection,
        selection: venueSelectionState(projection.visibleVenues, selectedId),
        countLabel: resultCountLabel(projection.resultCount),
    };
}

export function startProgressiveSession(venues, options = {}) {
    return reduceProgressiveSession({
        venues,
        window: createVenueWindow(venues),
        mode: options.mode ?? 'progressive',
        cap: options.cap ?? null,
        selectedId: options.selectedId ?? null,
    }, { type: 'sync', venues, mode: options.mode, cap: options.cap });
}
