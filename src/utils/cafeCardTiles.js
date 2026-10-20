/**
 * Feature tiles for the café sun card (docs/design/venue-sun-cards-brief.md §3).
 * A tile appears only when real data backs it; nothing is inferred from the
 * venue's name, vibe or photos. At most MAX_CAFE_TILES, in this order:
 * outdoor tables, dog-friendly, pram-friendly, wind-sheltered, heaters, fireplace.
 *
 * @module utils/cafeCardTiles
 */
import { isMicroclimateEntryStale } from './microclimateProvenance.js';

/** Café sun cards are for these typeLabel values only (City of Melbourne CLUE labels). */
export const CAFE_TYPE_LABELS = Object.freeze(['Cafe', 'Bakery cafe']);
export const MAX_CAFE_TILES = 4;

/**
 * wind_shelter_score at or above this shows "Wind-sheltered". enrich-microclimate
 * sets the score to 1 − 0.9 × the venue's exposure in the current wind
 * direction (from the buildings around it), so 0.6 means at most about 44% of
 * the open-ground wind reaches the venue right now. It follows the wind
 * direction, so the tile is an estimate for now, not a fixed feature, and a
 * stale reading (microclimateProvenance) shows nothing.
 */
export const WIND_SHELTERED_MIN_SCORE = 0.6;

export function isCafeVenue(venue) {
    return CAFE_TYPE_LABELS.includes(venue?.typeLabel);
}

function hasTag(venue, name) {
    const wanted = name.toLowerCase();
    return Array.isArray(venue?.tags) && venue.tags.some((tag) => typeof tag === 'string' && tag.trim().toLowerCase() === wanted);
}

/**
 * @param {object} venue app venue (Supabase `venues` row after normalizeVenueRow)
 * @param {{ microclimate?: object|null, now?: Date|number }} [context]
 *   microclimate: the venue's venues_in_bbox row (MicroclimateContext byId)
 * @returns {Array<{ key: string, label: string, icon: string, detail: string|null, kind: 'estimated'|null }>}
 *   `icon` is a src/assets/clay name. `kind` is the DataBadge kind when the
 *   tile is modelled rather than stored venue info.
 */
export function cafeCardTiles(venue, { microclimate = null, now = Date.now() } = {}) {
    if (!venue) return [];
    const tiles = [];

    const seats = Number(venue.outdoor_seats);
    if (Number.isInteger(seats) && seats > 0) {
        const source = venue.data_source === 'clue' ? ' · City of Melbourne CLUE' : '';
        tiles.push({ key: 'outdoor-tables', label: 'Outdoor tables', icon: 'garden-table',
            detail: `${seats} outdoor ${seats === 1 ? 'seat' : 'seats'}${source}`, kind: null });
    }

    // TODO(dog-friendly): needs a sourced field on venues, e.g. `dog_friendly`
    // boolean plus `dog_friendly_source` (venue-confirmed or a licensed listing).
    // Neither column exists yet, so this tile never shows. The demo
    // 'Pet Friendly' tags are hand-entered and deliberately not used.
    if (venue.dog_friendly === true && typeof venue.dog_friendly_source === 'string' && venue.dog_friendly_source.trim()) {
        tiles.push({ key: 'dog-friendly', label: 'Dog-friendly', icon: 'brucey', detail: null, kind: null });
    }

    // TODO(pram-friendly): needs `pram_friendly` boolean plus
    // `pram_friendly_source` on venues, as above. The demo 'Pram Friendly'
    // tags are not used.
    if (venue.pram_friendly === true && typeof venue.pram_friendly_source === 'string' && venue.pram_friendly_source.trim()) {
        tiles.push({ key: 'pram-friendly', label: 'Pram-friendly', icon: 'pram', detail: null, kind: null });
    }

    const shelter = typeof microclimate?.wind_shelter_score === 'number' ? microclimate.wind_shelter_score : Number.NaN;
    if (Number.isFinite(shelter) && shelter >= WIND_SHELTERED_MIN_SCORE && shelter <= 1
        && !isMicroclimateEntryStale(microclimate, now)) {
        tiles.push({ key: 'wind-sheltered', label: 'Wind-sheltered', icon: 'wind-sheltered',
            detail: 'From the current wind direction', kind: 'estimated' });
    }

    const heating = typeof venue.heating === 'string' ? venue.heating.toLowerCase() : '';
    if (heating.includes('heated outdoor')) {
        tiles.push({ key: 'heaters', label: 'Outdoor heaters', icon: 'heater', detail: null, kind: null });
    } else if (hasTag(venue, 'Heaters')) {
        tiles.push({ key: 'heaters', label: 'Heaters', icon: 'heater', detail: null, kind: null });
    }

    if (heating.includes('fireplace') || venue.hasFireplace === true || hasTag(venue, 'Fireplace')) {
        tiles.push({ key: 'fireplace', label: 'Fireplace', icon: 'fireplace', detail: null, kind: null });
    }

    return tiles.slice(0, MAX_CAFE_TILES);
}
