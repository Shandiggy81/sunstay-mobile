import { sunTier } from './sunPin.js';

/** Count existing map-pin tiers; missing scores never become a sun claim. */
export function mapHomeSummary(scores) {
    const known = scores.filter(Number.isFinite);
    return {
        total: scores.length,
        known: known.length,
        fullSun: known.filter(score => sunTier(Math.round(score)) === 'full').length,
    };
}

/**
 * The sun clause after the venue count on the home sheet. At night the full-sun
 * count is always 0, which reads like bad news, so say "after dark" instead.
 * No known scores means no sun claim at all (null).
 */
export function homeSunClause(summary, forecastKind) {
    if (!summary || summary.known <= 0) return null;
    if (forecastKind === 'night') return 'after dark';
    return `${summary.fullSun} in full sun`;
}
