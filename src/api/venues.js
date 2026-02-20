/**
 * Venue API — Payload Optimization
 * ──────────────────────────────────
 * Provides two fetch tiers:
 *   - fetchVenuesBrief()  → lightweight payload for map markers
 *   - fetchVenueDetails() → full venue object on selection
 *
 * Currently backed by local demoVenues data.
 * Swap the implementation to real API calls when the backend is ready.
 *
 * @module api/venues
 */

import { demoVenues } from '../data/demoVenues';

/**
 * Calculate a sunshine score (0–100) for a venue based on its tags.
 * In production this would come from the API; here we derive it locally.
 *
 * @param {object} venue
 * @returns {number}
 */
const calculateSunshineScore = (venue) => {
    let score = 50; // base

    const tags = venue.tags || [];

    // Positive signals
    if (tags.includes('Sunny')) score += 15;
    if (tags.includes('Afternoon Sun')) score += 10;
    if (tags.includes('Morning Sun')) score += 8;
    if (tags.includes('Midday Sun')) score += 8;
    if (tags.includes('Evening Sun')) score += 5;
    if (tags.includes('Rooftop')) score += 10;
    if (tags.includes('Views')) score += 5;
    if (tags.includes('Beer Garden')) score += 5;
    if (tags.includes('Garden')) score += 5;

    // Negative signals
    if (tags.includes('Covered')) score -= 5;
    if (tags.includes('Shaded')) score -= 8;
    if (tags.includes('Indoor')) score -= 15;

    // Room-level boost (hotel venues with sunScore on rooms)
    if (venue.roomTypes && venue.roomTypes.length > 0) {
        const avgRoomScore = venue.roomTypes.reduce(
            (sum, r) => sum + (r.sunScore || 50), 0
        ) / venue.roomTypes.length;
        score = Math.round((score + avgRoomScore) / 2);
    }

    return Math.max(0, Math.min(100, score));
};

/**
 * @typedef {Object} VenueBrief
 * @property {string} id
 * @property {number} lat
 * @property {number} lon
 * @property {number} sunshineScore
 */

/**
 * Fetch lightweight venue data for map markers.
 * Returns ONLY the fields needed for pin rendering: id, lat, lon, sunshineScore.
 *
 * Performance: ~200 bytes per venue vs ~2 KB for full details.
 * Designed to handle 1000+ venues without payload bloat.
 *
 * @returns {Promise<VenueBrief[]>}
 */
export const fetchVenuesBrief = async () => {
    // Simulate network latency (remove when using real API)
    await new Promise(resolve => setTimeout(resolve, 50));

    return demoVenues.map(venue => ({
        id: venue.id,
        lat: venue.lat,
        lon: venue.lng, // normalize lng → lon for API consistency
        sunshineScore: calculateSunshineScore(venue),
    }));
};

/**
 * Fetch full venue details for a single venue.
 * Called only when a user taps/clicks a map marker.
 *
 * @param {string} id - venue id (e.g., 'dv-01')
 * @returns {Promise<object | null>} full venue object or null if not found
 */
export const fetchVenueDetails = async (id) => {
    // Simulate network latency (remove when using real API)
    await new Promise(resolve => setTimeout(resolve, 80));

    const venue = demoVenues.find(v => v.id === id);
    if (!venue) return null;

    return {
        ...venue,
        sunshineScore: calculateSunshineScore(venue),
        // Enrich with computed fields a real API would provide
        _fetchedAt: new Date().toISOString(),
        _source: 'local-demo',
    };
};

/**
 * Batch fetch brief data for specific venue IDs.
 * Useful for re-rendering a subset of markers.
 *
 * @param {string[]} ids
 * @returns {Promise<VenueBrief[]>}
 */
export const fetchVenuesBriefByIds = async (ids) => {
    const all = await fetchVenuesBrief();
    const idSet = new Set(ids);
    return all.filter(v => idSet.has(v.id));
};
