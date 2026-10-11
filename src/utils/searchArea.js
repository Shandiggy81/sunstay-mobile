/**
 * "Search this area": after the user pans or zooms the map, offer to narrow
 * the venue list to what is on screen (like Airbnb). Bounds are plain
 * `{ minLng, minLat, maxLng, maxLat }` objects, the same shape `setBbox` uses.
 */
import { markerCoordinatePlan } from './mapMarkerLifecycle.js';

/** Centre must move this share of the visible span before we offer a search. */
const CENTRE_SHIFT = 0.3;
/** Zooming in or out by more than this factor also counts as a new area. */
const SPAN_RATIO = 1.6;

export function normalizeBounds(bounds) {
    if (!bounds) return null;
    const values = [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].map(Number);
    if (!values.every(Number.isFinite)) return null;
    const [minLng, minLat, maxLng, maxLat] = values;
    if (maxLng <= minLng || maxLat <= minLat) return null;
    return { minLng, minLat, maxLng, maxLat };
}

/**
 * True when `current` is meaningfully different from `last` (the area the list
 * last showed). With no previous area any valid viewport qualifies.
 */
export function areaPromptNeeded(last, current) {
    const next = normalizeBounds(current);
    if (!next) return false;
    const prev = normalizeBounds(last);
    if (!prev) return true;

    const prevW = prev.maxLng - prev.minLng;
    const prevH = prev.maxLat - prev.minLat;
    const nextW = next.maxLng - next.minLng;
    const nextH = next.maxLat - next.minLat;

    const dx = Math.abs((next.minLng + next.maxLng) / 2 - (prev.minLng + prev.maxLng) / 2);
    const dy = Math.abs((next.minLat + next.maxLat) / 2 - (prev.minLat + prev.maxLat) / 2);
    if (dx > prevW * CENTRE_SHIFT || dy > prevH * CENTRE_SHIFT) return true;

    const ratio = (nextW * nextH) / (prevW * prevH);
    const linear = Math.sqrt(ratio);
    return linear > SPAN_RATIO || linear < 1 / SPAN_RATIO;
}

/** Whether a venue's pin sits inside `bounds` (edges included). */
export function venueInBounds(venue, bounds) {
    const area = normalizeBounds(bounds);
    if (!area) return false;
    const plan = markerCoordinatePlan(venue);
    if (!plan.ok) return false;
    return plan.longitude >= area.minLng && plan.longitude <= area.maxLng
        && plan.latitude >= area.minLat && plan.latitude <= area.maxLat;
}

/** List label: "1 venue in this area", "12 venues in this area". */
export function areaCountLabel(count) {
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return `${n} ${n === 1 ? 'venue' : 'venues'} in this area`;
}
