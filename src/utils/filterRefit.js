/**
 * When the map should zoom to fit the filtered venues.
 *
 * The filtered set can change for two reasons: the user changed a filter or
 * search, or the data behind a filter changed (the "Sunny" filter reads each
 * venue's sun at the slider time, and that sun data reloads for every map
 * area). Only the first should move the map. Refitting on data changes made
 * the map jump after every pan, and could bounce: refit → new area → new sun
 * data → new set → refit.
 *
 * @param {object} input
 * @param {string|null} input.prevSetKey Venue set the map last saw (null = first load).
 * @param {string} input.nextSetKey Current venue set.
 * @param {string|undefined} input.prevFilterKey Filters + search the map last saw.
 * @param {string|undefined} input.nextFilterKey Current filters + search. Undefined keeps the
 *   old behaviour (refit on any set change).
 */
export function filterRefitNeeded({ prevSetKey, nextSetKey, prevFilterKey, nextFilterKey }) {
    if (prevSetKey == null) return false; // first load is the baseline, not a filter change
    if (nextSetKey === prevSetKey) return false;
    if (nextFilterKey === undefined) return true;
    return nextFilterKey !== prevFilterKey;
}

/** Stable key for the user's filter choices and settled search text. */
export function filterChoiceKey(activeFilters, searchQuery) {
    const filters = Array.isArray(activeFilters) ? [...activeFilters].map(String).sort() : [];
    return JSON.stringify([filters, String(searchQuery ?? '').trim().toLowerCase()]);
}
