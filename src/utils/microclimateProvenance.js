/**
 * Freshness and provenance of `venues_in_bbox` microclimate rows, for map pins
 * and the map caption's DataBadge.
 *
 * @module utils/microclimateProvenance
 */

import { lookupMicroclimateEntry, pinStateFromMicroclimate, readMicroclimate } from './microclimate.js';
import { markerCoordinatePlan } from './mapMarkerLifecycle.js';

/** Share of on-screen pins that must come from a microclimate profile for the caption to describe them. */
export const PROFILE_SHARE_THRESHOLD = 0.5;

/** Epoch ms for a Date, epoch-ms number or timestamp string, else null. */
export function timestampMs(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * True only when the row carries a readable `expires_at` at or before `now`.
 * A missing or unreadable `expires_at` counts as not expired.
 */
export function isMicroclimateEntryExpired(entry, now = Date.now()) {
    const expiresAt = timestampMs(entry?.expires_at);
    const nowMs = timestampMs(now);
    return expiresAt != null && nowMs != null && expiresAt <= nowMs;
}

/** The venue's microclimate row, or null when it has none or the row has expired. */
export function freshMicroclimateEntry(byId, venueId, now = Date.now()) {
    const entry = lookupMicroclimateEntry(byId, venueId);
    return entry && !isMicroclimateEntryExpired(entry, now) ? entry : null;
}

/** Newest readable `weather_computed_at` across all held rows, in epoch ms, or null. */
export function newestWeatherComputedAt(byId) {
    let newest = null;
    for (const entry of Object.values(byId || {})) {
        const computedAt = timestampMs(entry?.weather_computed_at);
        if (computedAt != null && (newest == null || computedAt > newest)) newest = computedAt;
    }
    return newest;
}

// Same coordinates the pin is placed at, including swapped lat/lng repair.
function insideBbox(venue, bbox) {
    const plan = markerCoordinatePlan(venue);
    return plan.ok
        && plan.latitude >= bbox.minLat && plan.latitude <= bbox.maxLat
        && plan.longitude >= bbox.minLng && plan.longitude <= bbox.maxLng;
}

/**
 * What the map caption's DataBadge should describe for the pins on screen.
 *
 * A pin counts as a profile pin when an unexpired microclimate row sets its
 * colour. When profile pins are at least half of the on-screen pins the badge
 * is 'calculated', aged by the OLDEST readable `weather_computed_at` among
 * them; rows without a readable time count toward the share but not the age.
 * Otherwise it describes the client weather fetch. `source` carries the split
 * for the badge's title and accessible name.
 *
 * @returns {{ kind: string, updatedAt: number|null, source: string }|null}
 *   null when there are no pins on screen, or weather is still loading and
 *   profile pins are not the majority.
 */
export function mapCaptionProvenance({
    venues,
    bbox,
    microById,
    todMinutes = null,
    weatherKind = null,
    weatherFetchedAt = null,
    now = Date.now(),
}) {
    if (!bbox || !Array.isArray(venues)) return null;
    const nowDate = new Date(timestampMs(now) ?? Date.now());

    let visible = 0;
    let profile = 0;
    let oldest = null;
    for (const venue of venues) {
        if (!insideBbox(venue, bbox)) continue;
        visible += 1;
        const entry = freshMicroclimateEntry(microById, venue.id, nowDate);
        if (!entry || !pinStateFromMicroclimate(readMicroclimate(entry, todMinutes, nowDate))) continue;
        profile += 1;
        const computedAt = timestampMs(entry.weather_computed_at);
        if (computedAt != null && (oldest == null || computedAt < oldest)) oldest = computedAt;
    }
    if (visible === 0) return null;

    const weatherSource = weatherKind === 'demo' ? 'sample weather' : 'Open-Meteo weather';
    const source = `${profile} of ${visible} pins from SunStay microclimate, ${visible - profile} from ${weatherSource}`;

    if (profile / visible >= PROFILE_SHARE_THRESHOLD) {
        return { kind: 'calculated', updatedAt: oldest, source };
    }
    if (!weatherKind) return null;
    return { kind: weatherKind, updatedAt: weatherFetchedAt, source };
}
