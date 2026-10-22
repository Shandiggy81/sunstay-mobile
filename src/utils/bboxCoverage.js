/**
 * Decides whether a map viewport needs a fresh venues_in_bbox request, given
 * the viewports already fetched. While the first view settles the map reports
 * its bounds several times, and each later view usually sits inside one that
 * was just read in full, so re-reading it would only download the same rows.
 *
 * @module utils/bboxCoverage
 */

// enrich-microclimate refreshes the cached readings every 20 minutes, so a
// fetch younger than this is never more than one refresh behind.
export const BBOX_FETCH_FRESH_MS = 10 * 60 * 1000;

// Enough to cover a session's recent viewports without the list growing.
const MAX_HISTORY = 20;

function isValidBbox(bbox) {
    if (!bbox) return false;
    const { minLng, minLat, maxLng, maxLat } = bbox;
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return false;
    return maxLng > minLng && maxLat > minLat;
}

/** True when `inner` lies entirely inside `outer`; shared edges count as inside. */
export function bboxContains(outer, inner) {
    return outer.minLng <= inner.minLng
        && outer.minLat <= inner.minLat
        && outer.maxLng >= inner.maxLng
        && outer.maxLat >= inner.maxLat;
}

/**
 * A response is complete when it holds fewer rows than the limit asked for.
 * At the limit the server may have cut rows off, so the area is not covered.
 */
export function isCompleteFetch(rowCount, limit) {
    return Number.isFinite(rowCount) && Number.isFinite(limit) && rowCount < limit;
}

/**
 * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}|null} bbox
 * @param {Array<{ bbox: object, fetchedAt: number, complete: boolean }>} history
 * @param {{ now?: number, maxAgeMs?: number }} [options]
 * @returns {boolean} false for an invalid bbox (nothing to request) or one
 *   inside a fresh, complete fetch; true otherwise.
 */
export function needsBboxFetch(bbox, history, { now = Date.now(), maxAgeMs = BBOX_FETCH_FRESH_MS } = {}) {
    if (!isValidBbox(bbox)) return false;
    if (!Array.isArray(history)) return true;
    return !history.some((entry) => entry
        && entry.complete
        && Number.isFinite(entry.fetchedAt)
        && now - entry.fetchedAt < maxAgeMs
        && isValidBbox(entry.bbox)
        && bboxContains(entry.bbox, bbox));
}

/**
 * The history with this fetch added, newest first, dropping stale entries.
 *
 * @returns {Array<{ bbox: object, fetchedAt: number, complete: boolean }>}
 */
export function recordBboxFetch(history, entry, { now = Date.now(), maxAgeMs = BBOX_FETCH_FRESH_MS } = {}) {
    const kept = (Array.isArray(history) ? history : [])
        .filter((e) => e && now - e.fetchedAt < maxAgeMs);
    return [entry, ...kept].slice(0, MAX_HISTORY);
}
