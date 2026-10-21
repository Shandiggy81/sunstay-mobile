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
