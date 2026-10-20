/**
 * Feature tiles for the café sun card (docs/design/venue-sun-cards-brief.md §3).
 * A tile appears only when real data backs it; nothing is inferred from the
 * venue's name, vibe or photos, and unknown is never shown as "no". At most
 * MAX_CAFE_TILES, in this order: outdoor tables, dog-friendly, pram-friendly,
 * sheltered from today's wind, outdoor heaters, fireplace.
 *
 * Venue amenities (dog, pram, heaters, fireplace) need a sourced record: the
 * field set to true plus a non-empty `<field>_source` (venue-confirmed or a
 * licensed listing). None of those columns exist yet, so those tiles are
 * hidden today. Hand-entered demo fields and tags (`heating`, `hasFireplace`,
 * 'Pet Friendly', 'Heaters' …) are deliberately not used.
 *
 * @module utils/cafeCardTiles
 */
import { isMicroclimateEntryStale } from './microclimateProvenance.js';
import { venueKind } from './venueKind.js';

export const MAX_CAFE_TILES = 4;

/**
 * wind_shelter_score at or above this shows "Sheltered from today's wind".
 * enrich-microclimate sets the score to 1 − 0.9 × the venue's exposure in the current wind
 * direction (from the buildings around it), so 0.6 means at most about 44% of
 * the open-ground wind reaches the venue right now. It follows the wind
 * direction, so the tile is an estimate for now, not a fixed feature, and a
 * stale reading (microclimateProvenance) shows nothing.
 */
export const WIND_SHELTERED_MIN_SCORE = 0.6;

/**
 * Café sun cards are for venues whose typeLabel says café or bakery
 * (utils/venueKind): "Cafe", "Bakery cafe", "Cafe & Roastery", "Library Cafe".
 * Never from the name, and never a stay (venueKind returns 'stay' first).
 */
export function isCafeVenue(venue) {
    const kind = venueKind(venue);
    return kind === 'cafe' || kind === 'bakery';
}

/** True only for a sourced amenity record: `venue[field] === true` and a non-empty `venue[field + '_source']`. */
function sourcedAmenity(venue, field) {
    const source = venue?.[`${field}_source`];
    return venue?.[field] === true && typeof source === 'string' && source.trim() !== '';
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

    // TODO(dog-friendly): needs `dog_friendly` boolean + `dog_friendly_source` on venues.
    if (sourcedAmenity(venue, 'dog_friendly')) {
        tiles.push({ key: 'dog-friendly', label: 'Dog-friendly', icon: 'brucey', detail: null, kind: null });
    }

    // TODO(pram-friendly): needs `pram_friendly` boolean + `pram_friendly_source` on venues.
    if (sourcedAmenity(venue, 'pram_friendly')) {
        tiles.push({ key: 'pram-friendly', label: 'Pram-friendly', icon: 'pram', detail: null, kind: null });
    }

    const shelter = typeof microclimate?.wind_shelter_score === 'number' ? microclimate.wind_shelter_score : Number.NaN;
    if (Number.isFinite(shelter) && shelter >= WIND_SHELTERED_MIN_SCORE && shelter <= 1
        && !isMicroclimateEntryStale(microclimate, now)) {
        tiles.push({ key: 'wind-sheltered', label: "Sheltered from today's wind", icon: 'wind-sheltered',
            detail: 'Depends on the wind direction', kind: 'estimated' });
    }

    // TODO(outdoor-heaters): needs `outdoor_heaters` boolean + `outdoor_heaters_source` on venues.
    if (sourcedAmenity(venue, 'outdoor_heaters')) {
        tiles.push({ key: 'heaters', label: 'Outdoor heaters', icon: 'heater', detail: null, kind: null });
    }

    // TODO(fireplace): needs `fireplace` boolean + `fireplace_source` on venues.
    if (sourcedAmenity(venue, 'fireplace')) {
        tiles.push({ key: 'fireplace', label: 'Fireplace', icon: 'fireplace', detail: null, kind: null });
    }

    return tiles.slice(0, MAX_CAFE_TILES);
}
