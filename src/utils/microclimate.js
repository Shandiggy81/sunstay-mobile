/**
 * Helpers for the `venues_in_bbox` RPC payload.
 *
 * The RPC returns each venue's microclimate profile, including
 * `sun_hour_fraction`: 24 slots of 0–1 sun availability indexed by
 * **Australia/Melbourne wall-clock hour** (AEST/AEDT via the TZ, not UTC),
 * slot 0 being 00:00 Melbourne. The time-of-day slider is also Melbourne
 * wall-clock minutes, so curve lookup is `floor(minutes / 60)` with no UTC
 * conversion.
 *
 * Map markers and map styling must read these cached columns
 * (`effective_sun`, `effective_wind`, `sun_now`, `sun_hour_fraction`) rather
 * than re-deriving sun/wind from client weather APIs when a profile exists.
 *
 * @module utils/microclimate
 */

import { MELBOURNE_TZ } from './sunPosition.js';

export const SUN_CURVE_SLOTS = 24;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

const asFiniteNumber = (value) => {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

/**
 * Map Melbourne wall-clock minutes onto the hour that indexes the curve.
 *
 * Slider minutes *are* Melbourne local, so this is a direct hour extraction
 * — no UTC conversion, and DST does not shift the slot.
 *
 * @param {number} minutes - minutes past Melbourne midnight
 * @param {Date} [_now] - unused; kept so call sites that passed a reference date stay valid
 * @returns {number|null} 0–23, or null when `minutes` is not a number
 */
export function localHourForMinutes(minutes, _now = new Date()) {
    const mins = asFiniteNumber(minutes);
    if (mins == null) return null;
    const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
    return Math.floor(wrapped / 60);
}

/**
 * Current Australia/Melbourne wall-clock hour (0–23), including DST.
 *
 * @param {Date} [now]
 * @returns {number|null}
 */
export function melbourneHourNow(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MELBOURNE_TZ,
        hour: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    return Number.isFinite(hour) ? hour : null;
}

/**
 * Sun availability at a given slider position.
 *
 * `effective_sun` is a live, cloud-adjusted reading for *now*, so it only
 * applies while the slider sits on the current Melbourne hour. Scrub away
 * from that and the precomputed curve is the honest answer. Without a curve
 * the only value available is `sun_now`, which the RPC already resolved for
 * a single hour, so it is returned as-is rather than pretending it covers
 * the whole day.
 *
 * @param {object|null} entry - one `venues_in_bbox` row
 * @param {number|null} minutes - slider minutes, or null for "now"
 * @param {Date} [now]
 * @returns {number|null} 0–1, or null when the venue has no profile
 */
export function resolveSunFraction(entry, minutes, now = new Date()) {
    if (!entry) return null;

    const sunNow = asFiniteNumber(entry.sun_now);
    if (minutes == null) return sunNow == null ? null : clamp01(sunNow);

    const hourLocal = localHourForMinutes(minutes, now);
    if (hourLocal == null) return sunNow == null ? null : clamp01(sunNow);

    const effectiveSun = asFiniteNumber(entry.effective_sun);
    if (effectiveSun != null && hourLocal === melbourneHourNow(now)) {
        return clamp01(effectiveSun);
    }

    const curve = entry.sun_hour_fraction;
    if (Array.isArray(curve) && curve.length === SUN_CURVE_SLOTS) {
        const slot = asFiniteNumber(curve[hourLocal]);
        if (slot != null) return clamp01(slot);
    }

    return sunNow == null ? null : clamp01(sunNow);
}

/**
 * Whether the venue has enough of a profile to show a sun reading at all.
 *
 * @param {object|null} entry
 * @returns {boolean}
 */
export function hasSunProfile(entry) {
    if (!entry) return false;
    const curve = entry.sun_hour_fraction;
    if (Array.isArray(curve) && curve.length === SUN_CURVE_SLOTS) return true;
    return asFiniteNumber(entry.sun_now) != null;
}

/**
 * @param {number|null} fraction - 0–1
 * @returns {string} e.g. "80%", or "—" when unknown
 */
export function formatSunPercent(fraction) {
    const n = asFiniteNumber(fraction);
    if (n == null) return '—';
    return `${Math.round(clamp01(n) * 100)}%`;
}

/**
 * Short plain-language band for a sun fraction.
 *
 * @param {number|null} fraction - 0–1
 * @returns {string|null}
 */
export function describeSun(fraction) {
    const n = asFiniteNumber(fraction);
    if (n == null) return null;
    const v = clamp01(n);
    if (v >= 0.75) return 'Full sun';
    if (v >= 0.4) return 'Partial sun';
    if (v > 0) return 'Mostly shaded';
    return 'In shade';
}

/**
 * `effective_wind` and `wind_shelter_score` are normalised 0–1 exposure
 * factors, matching `effective_sun`. 0 is fully sheltered, 1 fully exposed.
 * Anything outside that range is treated as unusable rather than guessed at,
 * so a future change of units shows up as a missing reading instead of a
 * confidently wrong one.
 *
 * @param {object|null} entry
 * @returns {number|null} 0–1
 */
export function resolveWindExposure(entry) {
    if (!entry) return null;
    const wind = asFiniteNumber(entry.effective_wind);
    if (wind == null || wind < 0 || wind > 1) return null;
    return wind;
}

/**
 * @param {number|null} exposure - 0–1
 * @returns {string|null}
 */
export function describeWindExposure(exposure) {
    const n = asFiniteNumber(exposure);
    if (n == null) return null;
    if (n >= 0.66) return 'Exposed';
    if (n >= 0.33) return 'Breezy';
    return 'Sheltered';
}

/**
 * Trim the server's comfort hint for display. Returns null for blank strings
 * so callers can fall back rather than render an empty row.
 *
 * @param {object|null} entry
 * @returns {string|null}
 */
export function resolveComfortHint(entry) {
    const hint = entry?.comfort_hint;
    if (typeof hint !== 'string') return null;
    const trimmed = hint.trim();
    return trimmed === '' ? null : trimmed;
}

// A bbox of exactly zero area matches nothing, and a single venue produces
// one. Pad by roughly a kilometre so a lone venue still resolves.
const MIN_BBOX_SPAN_DEG = 0.01;

/**
 * Bounding box covering a set of venues, for scoping the RPC when no map
 * viewport is available.
 *
 * @param {Array<{lat:*, lng:*}>|null|undefined} venues
 * @returns {{minLng:number,minLat:number,maxLng:number,maxLat:number}|null}
 */
export function boundsOfVenues(venues) {
    if (!Array.isArray(venues) || venues.length === 0) return null;

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    let seen = 0;

    for (const venue of venues) {
        const lat = asFiniteNumber(venue?.lat);
        const lng = asFiniteNumber(venue?.lng);
        if (lat == null || lng == null) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        seen += 1;
    }

    if (seen === 0) return null;

    const padLat = Math.max(0, (MIN_BBOX_SPAN_DEG - (maxLat - minLat)) / 2);
    const padLng = Math.max(0, (MIN_BBOX_SPAN_DEG - (maxLng - minLng)) / 2);

    return {
        minLng: minLng - padLng,
        minLat: minLat - padLat,
        maxLng: maxLng + padLng,
        maxLat: maxLat + padLat,
    };
}

/**
 * Label the time a reading applies to, for captions like
 * "Microclimate at 2:30 PM".
 *
 * @param {number|null} minutes - slider minutes, or null for "now"
 * @returns {string} 12-hour clock, or "now" when the slider is untouched
 */
export function formatReadingTime(minutes) {
    const mins = asFiniteNumber(minutes);
    if (mins == null) return 'now';
    const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
    const h24 = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Collapse one RPC row into everything the UI needs for a given slider time.
 *
 * @param {object|null} entry
 * @param {number|null} minutes
 * @param {Date} [now]
 * @returns {{
 *   available: boolean,
 *   sunFraction: number|null,
 *   sunPercent: string,
 *   sunLabel: string|null,
 *   windExposure: number|null,
 *   windLabel: string|null,
 *   comfortHint: string|null,
 *   isLiveSun: boolean,
 *   confidence: number|null,
 * }}
 */
export function readMicroclimate(entry, minutes, now = new Date()) {
    const sunFraction = resolveSunFraction(entry, minutes, now);
    const windExposure = resolveWindExposure(entry);
    const comfortHint = resolveComfortHint(entry);
    const hourLocal = localHourForMinutes(minutes, now);
    const isLiveSun = Boolean(
        entry
        && asFiniteNumber(entry.effective_sun) != null
        && (minutes == null || hourLocal === melbourneHourNow(now))
    );

    return {
        available: Boolean(entry) && (hasSunProfile(entry) || windExposure != null || comfortHint != null),
        sunFraction,
        sunPercent: formatSunPercent(sunFraction),
        sunLabel: describeSun(sunFraction),
        windExposure,
        windLabel: describeWindExposure(windExposure),
        comfortHint,
        isLiveSun,
        confidence: asFiniteNumber(entry?.geometry_confidence),
    };
}

/**
 * Mapbox pin key from cached microclimate. Returns null when the venue has
 * no profile so callers can fall back to existing client estimates.
 *
 * @param {ReturnType<typeof readMicroclimate>|null} reading
 * @returns {'sunshine'|'sunny'|'cloudy'|'windy'|'default'|null}
 */
export function pinStateFromMicroclimate(reading) {
    if (!reading?.available) return null;
    const sun = asFiniteNumber(reading.sunFraction);
    const wind = asFiniteNumber(reading.windExposure);
    if (sun == null && wind == null) return null;
    if (sun != null && sun >= 0.75) return 'sunshine';
    if (wind != null && wind >= 0.66) return 'windy';
    if (sun != null && sun >= 0.4) return 'sunny';
    if (sun != null && sun > 0) return 'cloudy';
    if (sun != null) return 'default';
    return null;
}

/**
 * 0–100 pin badge from the cached sun fraction. Null when unknown so the
 * map can keep its existing score fallback.
 *
 * @param {ReturnType<typeof readMicroclimate>|null} reading
 * @returns {number|null}
 */
export function markerScoreFromMicroclimate(reading) {
    const sun = asFiniteNumber(reading?.sunFraction);
    if (sun == null) return null;
    return Math.round(clamp01(sun) * 100);
}
