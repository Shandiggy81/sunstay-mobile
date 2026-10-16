/**
 * Sun-moment quick filters ("Coffee sun", "Lunch sun", "Sunset drinks") and
 * the matching check Sunny's chat context uses.
 *
 * A venue matches a moment when its stored building horizon gives it direct
 * sun in that moment today AND the forecast sky for it isn't cloud or rain.
 * Venues without a horizon never match.
 */
import { DEFAULT_TIME_ZONE, venueLocalDate } from './balconySunEngine.js';
import { outdoorSunDay, parseSunHorizon, sunMomentsFromDay } from './sunMoments.js';

export const SUN_MOMENT_FILTERS = Object.freeze([
    { id: 'moment-coffee', moment: 'coffee', label: 'Coffee sun', icon: 'coffee' },
    { id: 'moment-lunch', moment: 'lunch', label: 'Lunch sun', icon: 'dining' },
    { id: 'moment-sunset', moment: 'sunset', label: 'Sunset drinks', icon: 'cocktail' },
]);

const MOMENT_BY_FILTER = new Map(SUN_MOMENT_FILTERS.map((f) => [f.id, f.moment]));

export function isSunMomentFilter(id) {
    return MOMENT_BY_FILTER.has(id);
}

/** Moment keys ('coffee', …) for the sun-moment filter ids among `filters`. */
export function activeSunMoments(filters) {
    if (!Array.isArray(filters)) return [];
    return filters.filter((f) => MOMENT_BY_FILTER.has(f)).map((f) => MOMENT_BY_FILTER.get(f));
}

/** Direct sun in the moment today, under a sky that isn't cloud or rain. */
export function momentInSun(moment) {
    return moment?.available === true && moment.sky !== 'cloud' && moment.sky !== 'rain';
}

/**
 * Moment keys a venue gets sun in today (see momentInSun), or [] without a
 * usable horizon or position.
 *
 * @param {object} input
 * @param {object} input.venue  needs lat/lng; timeZone optional
 * @param {number[]|null} input.horizon  36-sector sun_horizon_deg
 * @param {object|null} [input.forecast] deriveSunForecast() result for today
 * @param {Date} [input.now]
 */
export function venueSunMomentKeys({ venue, horizon, forecast = null, now = new Date() }) {
    const parsed = parseSunHorizon(horizon);
    if (!parsed || !venue) return [];
    const timeZone = venue.timeZone ?? DEFAULT_TIME_ZONE;
    let date;
    try { date = venueLocalDate(now, timeZone); } catch { return []; }
    const daily = outdoorSunDay({ lat: venue.lat, lng: venue.lng, horizon: parsed, date, timeZone });
    if (!daily) return [];
    return sunMomentsFromDay({ daily, forecast, timeZone }).moments
        .filter(momentInSun)
        .map((m) => m.key);
}

/**
 * Venue id → moment keys in sun today, for every venue with a horizon.
 *
 * @param {object[]} venues
 * @param {Map<string, number[]|null>} horizons  venue id → horizon
 * @param {{ forecast?: object|null, now?: Date }} [options]
 * @returns {Map<string, string[]>}
 */
export function sunMomentsByVenue(venues, horizons, { forecast = null, now = new Date() } = {}) {
    const job = createSunMomentsJob(venues, horizons, { forecast, now });
    job.run(() => false);
    return job.result;
}

/**
 * sunMomentsByVenue() split into resumable steps, so the work can run in
 * small slices while the page is idle. `run(shouldYield)` works through
 * venues until it is done or `shouldYield()` returns true, and returns
 * whether it is done. `result` is the same Map sunMomentsByVenue() returns,
 * complete once `done` is true.
 */
export function createSunMomentsJob(venues, horizons, { forecast = null, now = new Date() } = {}) {
    const list = Array.isArray(venues) && horizons instanceof Map ? venues : [];
    const result = new Map();
    let index = 0;
    return {
        result,
        get done() { return index >= list.length; },
        run(shouldYield) {
            while (index < list.length) {
                const venue = list[index++];
                if (venue?.id != null) {
                    const id = String(venue.id);
                    const horizon = horizons.get(id);
                    if (horizon) {
                        const keys = venueSunMomentKeys({ venue, horizon, forecast, now });
                        if (keys.length) result.set(id, keys);
                    }
                }
                if (index < list.length && shouldYield()) return false;
            }
            return true;
        },
    };
}

/** True when the venue gets sun in every one of the wanted moments. */
export function venueMatchesSunMoments(keys, wanted) {
    if (!Array.isArray(wanted) || wanted.length === 0) return true;
    if (!Array.isArray(keys)) return false;
    return wanted.every((m) => keys.includes(m));
}

/** Venue ids not yet in the session cache, as strings, deduplicated. */
export function horizonIdsToFetch(ids, cache) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(ids) ? ids : []) {
        if (raw == null || raw === '') continue;
        const id = String(raw);
        if (seen.has(id) || cache?.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * True when two sets of sun-moment inputs would give the same result: the same
 * venue list, horizon map and weather objects (by identity) on the same
 * venue-local day. Lets a caller reuse its last sunMomentsByVenue() result.
 */
export function sameSunMomentInputs(a, b) {
    return Boolean(a && b)
        && a.venues === b.venues
        && a.horizons === b.horizons
        && a.weather === b.weather
        && a.day === b.day;
}

/**
 * Horizons a venue list already carries (sun_horizon_deg on the venue record),
 * as venue id → parsed horizon or null. Venues without the field are left out
 * so they are looked up as usual.
 */
export function inlineSunHorizons(venues) {
    const out = new Map();
    for (const venue of Array.isArray(venues) ? venues : []) {
        if (venue?.id == null || !Object.prototype.hasOwnProperty.call(venue, 'sun_horizon_deg')) continue;
        out.set(String(venue.id), parseSunHorizon(venue.sun_horizon_deg));
    }
    return out;
}

/**
 * Split venue ids into request-sized batches. A PostgREST `in` filter puts
 * every id in the URL, and a few hundred ids overflow the gateway's URL limit,
 * so large venue lists are fetched in several requests.
 */
export const HORIZON_BATCH_SIZE = 150;
export function chunkIds(ids, size = HORIZON_BATCH_SIZE) {
    const list = Array.isArray(ids) ? ids : [];
    const step = Number.isInteger(size) && size > 0 ? size : HORIZON_BATCH_SIZE;
    const out = [];
    for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
    return out;
}

/**
 * Store microclimate_profiles rows in the cache. Every requested id is
 * cached, as null when it has no row or no usable horizon, so it isn't
 * asked for again this session.
 */
export function cacheHorizonRows(cache, requestedIds, rows) {
    for (const id of requestedIds) cache.set(String(id), null);
    for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.venue_id == null) continue;
        cache.set(String(row.venue_id), parseSunHorizon(row.sun_horizon_deg));
    }
    return cache;
}
