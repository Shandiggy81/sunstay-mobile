/**
 * Shareable venue links: https://…/?venue=<id> opens that venue's card.
 * The same pattern as the hotel sun report's ?report=<id>
 * (hotelSunReportRoute.js): other URL state is preserved, and opening a card
 * from the app pushes a history entry so the phone's back gesture closes it.
 */
export const VENUE_PARAM = 'venue';

export function readVenueLinkId(search) {
    try {
        return new URLSearchParams(search).get(VENUE_PARAM)?.trim() || null;
    } catch {
        return null;
    }
}

/** The current URL with ?venue set to `id`, or removed when id is null. */
export function venueLinkUrl(href, id) {
    const url = new URL(href);
    const value = id == null ? '' : String(id).trim();
    if (value) url.searchParams.set(VENUE_PARAM, value);
    else url.searchParams.delete(VENUE_PARAM);
    return url.toString();
}

/** A clean link to share: the app's own address with only ?venue=<id>. */
export function venueShareUrl(href, id) {
    const url = new URL(href);
    return `${url.origin}${url.pathname}?${VENUE_PARAM}=${encodeURIComponent(String(id))}`;
}

/** What the share sheet says about a venue. */
export function venueShareMessage(venue) {
    const name = String(venue?.venueName ?? venue?.name ?? '').trim() || 'this spot';
    return { title: `${name} on SunStay`, text: `Sun, weather and what's on at ${name}` };
}

/**
 * Whether a linked venue can be opened yet. Waits for the live venue list so
 * a link never opens the demo copy and is then swapped out.
 * @returns {{ status: 'none'|'pending'|'found'|'missing', venue: object|null }}
 */
export function resolveVenueLink({ id, venues, loading, lookupStarted }) {
    if (!id) return { status: 'none', venue: null };
    if (!lookupStarted || loading) return { status: 'pending', venue: null };
    const venue = (Array.isArray(venues) ? venues : []).find(v => String(v?.id) === String(id)) ?? null;
    return venue ? { status: 'found', venue } : { status: 'missing', venue: null };
}

/**
 * How the address bar should follow the open card.
 * @returns {null | { action: 'push'|'replace', url: string } | { action: 'back' }}
 */
export function venueUrlChange({ href, openId, cardEntry }) {
    const current = readVenueLinkId(new URL(href).search);
    const next = openId == null ? null : String(openId);
    if (current === next) return null;
    if (next && !current) return { action: 'push', url: venueLinkUrl(href, next) };
    if (next) return { action: 'replace', url: venueLinkUrl(href, next) };
    // Closing: undo our own history entry, or just drop the param from a shared link.
    return cardEntry ? { action: 'back' } : { action: 'replace', url: venueLinkUrl(href, null) };
}
