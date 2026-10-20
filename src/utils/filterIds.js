/**
 * Every filter id the app understands, built from the modules that define
 * them, so a new chip is allowed as soon as it exists.
 *
 * APP_FILTER_IDS: what the app's own controls put in activeFilters
 * - FilterSheet chips: FILTER_CATEGORIES (food types, Stays/Homes, venue tags)
 * - quick chips and the discovery presets: Stays, Homes, Sunny now, Cozy and
 *   the sun moments (coffee, lunch, sunset)
 * - Sunny's quick-reply chips, which use FILTER_CATEGORIES tags
 *
 * AMENITY_FILTER_IDS: the key amenity labels ("Dog friendly", "Hidden gem"…).
 * Sunny sees venues tagged with these and filters by them; the venue filter
 * matches them through venueMatchesAmenityFilter.
 *
 * Sunny's setFilters tool may only use these (utils/sunnyTools), so an id the
 * model makes up can't empty the list or match something it shouldn't.
 *
 * @module utils/filterIds
 */
import { FILTER_CATEGORIES } from '../data/demoVenues.js';
import { SUN_MOMENT_FILTERS } from './sunMomentFilters.js';
import { KEY_AMENITIES } from './venueAmenities.js';

export const FILTER_COZY = 'cozy-mode';
export const FILTER_SUNNY = 'sunny-mode';

export const APP_FILTER_IDS = Object.freeze([...new Set([
    ...FILTER_CATEGORIES.map((filter) => filter.id),
    FILTER_SUNNY,
    FILTER_COZY,
    ...SUN_MOMENT_FILTERS.map((filter) => filter.id),
])]);

export const AMENITY_FILTER_IDS = Object.freeze(KEY_AMENITIES.map((amenity) => amenity.label));

// Lower case → the app's own spelling. App ids first, so "wheelchair
// accessible" becomes the chip id "Wheelchair Accessible".
const CANONICAL = new Map();
for (const id of [...APP_FILTER_IDS, ...AMENITY_FILTER_IDS]) {
    const key = id.toLowerCase();
    if (!CANONICAL.has(key)) CANONICAL.set(key, id);
}

/**
 * The app's spelling of a filter id, matched without regard to case or
 * surrounding space, or null for an id the app doesn't have.
 */
export function canonicalFilterId(id) {
    if (typeof id !== 'string') return null;
    return CANONICAL.get(id.trim().toLowerCase()) ?? null;
}
