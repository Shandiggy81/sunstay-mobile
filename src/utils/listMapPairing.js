/**
 * List ↔ map pairing (docs/design/research/venue-card-patterns.md, "Steal
 * this" #1): one shared venue id links a list row and its map pin. Selection
 * (tap) already flows through App's selectedVenue; this covers the hover /
 * focus highlight that runs alongside it.
 *
 * @module utils/listMapPairing
 */

/**
 * True for pointers that can hover without pressing (mouse, pen). Touch has
 * no hover: a tap selects, and a highlight left behind by an emulated
 * pointerenter would stick until the next tap.
 */
export function isHoverPointer(event) {
    const type = event?.pointerType;
    return type === 'mouse' || type === 'pen';
}

/**
 * Keyboard focus only: a tap also focuses the row, and that must not leave a
 * highlight behind. `:focus-visible` is what the browser shows a ring for.
 */
export function isKeyboardFocus(element) {
    try { return Boolean(element?.matches?.(':focus-visible')); } catch { return false; }
}

/** Venue ids compared as strings, the way map pins store them. */
export function sameVenueId(a, b) {
    return a != null && b != null && String(a) === String(b);
}

/**
 * The highlight id after a row or pin hover event: `enter` claims it, and
 * `leave` releases it only if this venue still holds it, so leaving one row
 * after entering the next never clears the new highlight.
 *
 * @param {string|number|null} current
 * @param {{ type: 'enter'|'leave', venueId: string|number|null }} event
 * @returns {string|null}
 */
export function nextHighlightedVenueId(current, { type, venueId }) {
    if (type === 'enter') return venueId != null ? String(venueId) : current ?? null;
    if (type === 'leave') return sameVenueId(current, venueId) ? null : current ?? null;
    return current ?? null;
}

/**
 * The venue whose pin the pointer was over, if a marker sync has removed that
 * pin (a wheel zoom folding it into a cluster). A removed element fires no
 * pointerleave, so without this its row would stay highlighted.
 *
 * @param {string|null} hoverId  venue id of the pin under the pointer
 * @param {Record<string, { venueId?: string, isCluster?: boolean, released?: boolean }>} records
 * @returns {string|null} the id to send a `leave` for, or null
 */
export function orphanedPinHover(hoverId, records) {
    if (hoverId == null) return null;
    const id = String(hoverId);
    const live = Object.values(records || {}).some((record) => record && !record.released && !record.isCluster && record.venueId === id);
    return live ? null : id;
}
