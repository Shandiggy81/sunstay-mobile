import { normaliseName } from './venueNameMatch.js';

/**
 * Type-ahead suggestions for the top search bar: venues by name first, then
 * suburbs. Ranking for a venue name (lower is better):
 *   0 exact · 1 starts with the query · 2 every query word starts a name word
 *   · 3 contains the query. Suburb-only matches become place rows instead.
 */
export const MAX_VENUE_SUGGESTIONS = 6;
export const MAX_PLACE_SUGGESTIONS = 2;

const words = text => text.split(' ').filter(Boolean);

function nameRank(name, query, queryWords) {
    if (!name) return null;
    if (name === query) return 0;
    if (name.startsWith(query)) return 1;
    const nameWords = words(name);
    if (queryWords.every(q => nameWords.some(w => w.startsWith(q)))) return 2;
    if (name.includes(query)) return 3;
    return null;
}

/**
 * @param {string} rawQuery what the guest has typed so far
 * @param {object[]} venues every venue (not just the filtered list)
 * @param {{ typeLabel?: (venue: object) => string }} [options]
 * @returns {{ venues: Array<{ venue: object, name: string, detail: string }>,
 *   places: Array<{ label: string, count: number }> }}
 */
export function searchSuggestions(rawQuery, venues, { typeLabel = () => '' } = {}) {
    const query = normaliseName(rawQuery);
    const empty = { venues: [], places: [] };
    if (query.length < 2 || !Array.isArray(venues)) return empty;
    const queryWords = words(query);

    const ranked = [];
    const suburbs = new Map();
    for (const venue of venues) {
        const displayName = String(venue?.venueName ?? venue?.name ?? '').trim();
        const normal = normaliseName(displayName);
        const rank = nameRank(normal, query, queryWords);
        if (rank != null) ranked.push({ venue, rank, displayName, normal });
        const suburb = String(venue?.suburb ?? '').trim();
        const suburbKey = normaliseName(suburb);
        if (suburbKey && (suburbKey.startsWith(query) || words(suburbKey).some(w => w.startsWith(query)) && query.length >= 3)) {
            const entry = suburbs.get(suburbKey) ?? { label: suburb, count: 0 };
            entry.count += 1;
            suburbs.set(suburbKey, entry);
        }
    }
    ranked.sort((a, b) => a.rank - b.rank || a.normal.length - b.normal.length || a.displayName.localeCompare(b.displayName));

    const seen = new Set();
    const venueRows = [];
    for (const { venue, displayName } of ranked) {
        const key = `${normaliseName(displayName)}|${normaliseName(venue?.suburb)}`;
        if (seen.has(key)) continue; // the same place listed twice shows once
        seen.add(key);
        const type = String(typeLabel(venue) ?? '').trim();
        const suburb = String(venue?.suburb ?? '').trim();
        venueRows.push({ venue, name: displayName, detail: [type, suburb].filter(Boolean).join(' · ') });
        if (venueRows.length >= MAX_VENUE_SUGGESTIONS) break;
    }

    const places = [...suburbs.values()]
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, MAX_PLACE_SUGGESTIONS);
    return { venues: venueRows, places };
}
