/** Matrix ceiling for the card-count isolation arm. Not the product default. */
export const MOBILE_VENUE_RENDER_LIMIT = 59;

export const VENUE_RENDER_LIMIT_CHOICES = [15, 30, 45, MOBILE_VENUE_RENDER_LIMIT];

/**
 * Slice an already filtered, already sorted venue list.
 * `null` means no diagnostic cap. Product lists use the progressive window
 * instead of this slice. Diagnostic `venueLimit=all` also passes null and
 * shows every filtered venue, with no Load more button.
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

/**
 * Separate the product progressive window from the diagnostic query.
 * Missing / invalid → progressive. `all` → show every result, no Load more.
 * 15 / 30 / 45 / 59 → hard cap, no Load more.
 */
export function classifyVenueRenderLimit(value) {
    if (value == null || String(value).trim() === '') {
        return { mode: 'progressive', limit: null };
    }
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'all') return { mode: 'diagnostic-all', limit: null };
    const limit = parseVenueRenderLimit(normalized);
    if (limit == null) return { mode: 'progressive', limit: null };
    return { mode: 'diagnostic-cap', limit };
}
