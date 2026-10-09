import {
    lookupMicroclimateEntry,
    markerScoreFromMicroclimate,
    readMicroclimate,
} from './microclimate.js';

/**
 * The one Sunstay score the venue list shows and sorts by.
 *
 * The cached microclimate profile wins, read at the time-of-day slider's
 * minute, which is the same number the map pin and the detail sheet show.
 * Venues with no profile row fall back to the weather-based
 * `calculateSunstayScore`. Using this for both the sort and the card badge
 * keeps the list order consistent with the numbers on screen.
 *
 * @param {object} venue
 * @param {{
 *   byId?: Record<string, object>|null,
 *   todMinutes?: number|null,
 *   calculateSunstayScore?: (venue: object) => number|null|undefined,
 *   now?: Date,
 * }} [options]
 * @returns {number|null} 0–100, or null when no score is known.
 */
export function venueDisplayScore(venue, {
    byId = null,
    todMinutes = null,
    calculateSunstayScore = null,
    now = new Date(),
} = {}) {
    if (!venue) return null;
    const entry = lookupMicroclimateEntry(byId, venue.id);
    if (entry) {
        const profileScore = markerScoreFromMicroclimate(readMicroclimate(entry, todMinutes, now));
        if (profileScore != null) return profileScore;
    }
    const raw = typeof calculateSunstayScore === 'function' ? calculateSunstayScore(venue) : null;
    return Number.isFinite(raw) ? Math.round(raw) : null;
}
