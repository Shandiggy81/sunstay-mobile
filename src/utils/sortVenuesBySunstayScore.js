/**
 * Copy-then-sort venues by active Sunstay score, highest first.
 * Null / non-finite scores sink to the bottom (never NaN-sort).
 * Scores each venue once per call.
 *
 * @param {Array<object>} venues
 * @param {(venue: object) => number|null|undefined} scoreFn
 * @returns {Array<object>}
 */
export function sortVenuesBySunstayScore(venues, scoreFn) {
    if (!Array.isArray(venues) || venues.length === 0) return [];

    const scored = venues.map((venue) => {
        const raw = typeof scoreFn === 'function' ? scoreFn(venue) : null;
        const n = typeof raw === 'number' ? raw : Number(raw);
        return {
            venue,
            score: Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY,
        };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.venue);
}
