/** Matrix ceiling for the card-count isolation arm. Not the product default. */
export const MOBILE_VENUE_RENDER_LIMIT = 59;

export const VENUE_RENDER_LIMIT_CHOICES = [15, 30, 45, MOBILE_VENUE_RENDER_LIMIT];

/**
 * Slice an already filtered, already sorted venue list.
 * `null` keeps every venue (product default).
 * The mascot indicator is not part of this array — it stays a sibling of the list.
 */
export function sliceVenuesForRender(venues, limit) {
    const list = Array.isArray(venues) ? venues : [];
    if (limit == null) return list;
    const count = Number(limit);
    if (!Number.isInteger(count) || count < 0) return list;
    return list.slice(0, count);
}

export function parseVenueRenderLimit(value) {
    if (value == null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '' || normalized === 'all') return null;
    const count = Number(normalized);
    if (VENUE_RENDER_LIMIT_CHOICES.includes(count)) return count;
    return null;
}
