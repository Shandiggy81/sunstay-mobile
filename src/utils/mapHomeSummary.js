import { sunTier } from './sunPin.js';

/** Count existing map-pin tiers; missing scores never become a sun claim. */
export function mapHomeSummary(scores) {
    const known = scores.filter(Number.isFinite);
    return {
        total: scores.length,
        known: known.length,
        fullSun: known.filter(score => sunTier(Math.round(score)) === 'full').length,
        partSun: known.filter(score => sunTier(Math.round(score)) === 'part').length,
    };
}

/**
 * The sun clause after the venue count on the home sheet. At night the full-sun
 * count is always 0, which reads like bad news, so say "after dark" instead.
 * On a patchy day nothing may reach full sun while plenty get some, so lead
 * with that; with neither, say so plainly rather than "0 in full sun".
 * No known scores means no sun claim at all (null).
 */
export function homeSunClause(summary, forecastKind) {
    if (!summary || summary.known <= 0) return null;
    if (forecastKind === 'night') return 'after dark';
    const fmt = n => n.toLocaleString('en-AU');
    if (summary.fullSun > 0) return `${fmt(summary.fullSun)} in full sun`;
    if (summary.partSun > 0) return `${fmt(summary.partSun)} with some sun`;
    return 'little direct sun now';
}
