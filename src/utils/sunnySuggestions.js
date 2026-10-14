/**
 * Pure helpers for Sunny's chat: the venue mini cards under a reply, the
 * time-of-day quick-reply chips, and the compact forecast / sun-window
 * context posted to chat-sunny.
 */

import { normaliseTag } from './venueOfferings.js';
import { formatHour } from './sunForecastState.js';

export const MAX_SUGGESTIONS = 3;

// Tag aliases, so "Pet Friendly" also finds venues tagged "dog-friendly".
const TAG_ALIASES = Object.freeze({
    'pet friendly': ['pet friendly', 'dog friendly'],
    'dog friendly': ['pet friendly', 'dog friendly'],
    'live music': ['live music'],
});

export function venueHasTag(venue, tag) {
    const wanted = normaliseTag(tag);
    if (!wanted || !Array.isArray(venue?.tags)) return false;
    const accept = TAG_ALIASES[wanted] ?? [wanted];
    return venue.tags.some((t) => accept.includes(normaliseTag(t)));
}

function byScore(venues, scoreFn) {
    const scored = venues.map((venue, index) => {
        const raw = typeof scoreFn === 'function' ? scoreFn(venue) : null;
        return { venue, index, score: Number.isFinite(raw) ? raw : -1 };
    });
    // Stable: equal scores keep list order.
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.map((s) => s.venue);
}

/**
 * Up to three venues for a quick action, best sun score first. A null tag
 * (the "sunny" actions) ranks every venue by score.
 *
 * @param {object[]} venues
 * @param {string|null} tag
 * @param {(venue: object) => number|null} [scoreFn]
 */
export function suggestVenuesForTag(venues, tag, scoreFn) {
    if (!Array.isArray(venues)) return [];
    const pool = tag ? venues.filter((v) => venueHasTag(v, tag)) : venues.filter(Boolean);
    return byScore(pool, scoreFn).slice(0, MAX_SUGGESTIONS);
}

/**
 * The venues Sunny named with panToVenue, in the order it named them,
 * skipping unknown and repeated ids.
 *
 * @param {string[]} ids
 * @param {object[]} venues
 */
export function resolveSuggestedVenues(ids, venues) {
    if (!Array.isArray(ids) || !Array.isArray(venues)) return [];
    const byId = new Map(venues.filter((v) => v?.id != null).map((v) => [String(v.id), v]));
    const out = [];
    const seen = new Set();
    for (const id of ids) {
        const key = String(id ?? '');
        if (!key || seen.has(key) || !byId.has(key)) continue;
        seen.add(key);
        out.push(byId.get(key));
        if (out.length >= MAX_SUGGESTIONS) break;
    }
    return out;
}

export function isDogIntent(text) {
    return typeof text === 'string' && /\b(dogs?|pets?|pupp(y|ies)|pups?|doggo|pooch|brucey)\b|dog-friendly|pet-friendly/i.test(text);
}

export const BRUCEY_LINE = "Brucey's sniffed these out 🐾";

// One chip per part of the day, each with a clay icon and the filter it applies.
const TIME_CHIPS = Object.freeze([
    { from: 5, to: 11, chip: { intent: 'morning', text: 'Morning coffee in the sun', icon: 'coffee', tag: 'Specialty Coffee', response: 'Coffee and a bit of sun, coming up. Here are a few good spots.' } },
    { from: 11, to: 15, chip: { intent: 'lunch', text: 'Lunch in the sun', icon: 'dining', tag: null, response: 'Lunch outside it is. These are getting the best sun right now.' } },
    { from: 15, to: 18, chip: { intent: 'after-work', text: 'After-work drinks', icon: 'pint', tag: 'Beer Garden', response: 'Knock-off time. A few beer gardens worth a look.' } },
    { from: 18, to: 21, chip: { intent: 'sunset', text: 'Sunset spots', icon: 'sunset', tag: 'Views', response: 'Good call. These have the views for sunset.' } },
]);

/**
 * The time-of-day chip for a Melbourne wall-clock hour, or null late at night.
 * @param {number} hour 0–23
 */
export function timeOfDayChip(hour) {
    const h = Number(hour);
    if (!Number.isFinite(h)) return null;
    const match = TIME_CHIPS.find((c) => h >= c.from && h < c.to);
    return match ? { ...match.chip } : null;
}

const SUN_SLOT = 0.5;

/**
 * Today's sun window for one venue: the longest run of hours where its
 * microclimate curve has the venue in sun AND the forecast has direct sun.
 * Falls back to whichever of the two is available.
 *
 * @param {number[]|null} curve 24 Melbourne-hour sun fractions (sun_hour_fraction)
 * @param {object|null} forecast deriveSunForecast() result
 * @returns {string|null} e.g. "10am–2pm", "none" when neither finds sun, null when nothing is known
 */
export function venueSunWindowToday(curve, forecast) {
    const hasCurve = Array.isArray(curve) && curve.length === 24;
    const hasForecast = Boolean(forecast?.hasHourly && Array.isArray(forecast.hours));
    if (!hasCurve && !hasForecast) return null;

    let best = null;
    let start = null;
    for (let h = 0; h <= 24; h += 1) {
        const inCurve = h < 24 && (!hasCurve || Number(curve[h]) >= SUN_SLOT);
        const inForecast = h < 24 && (!hasForecast || forecast.hours[h]?.kind === 'sun');
        const sunny = inCurve && inForecast;
        if (sunny && start == null) start = h;
        if (!sunny && start != null) {
            if (!best || h - start > best[1] - best[0]) best = [start, h];
            start = null;
        }
    }
    if (!best) return 'none';
    // Like heroSunChip: the first and last sunny hours end at sunrise and sunset.
    const from = Number.isFinite(forecast?.sunriseHour) ? Math.max(best[0], forecast.sunriseHour) : best[0];
    const to = Number.isFinite(forecast?.sunsetHour) ? Math.min(best[1], forecast.sunsetHour) : best[1];
    if (to <= from) return 'none';
    return `${formatHour(from)}–${formatHour(to)}`;
}

const KIND_WORD = Object.freeze({ sun: 'sun', cloud: 'cloud', rain: 'rain', night: 'night', day: 'day', shaded: 'shade' });

/**
 * Compact forecast for the rest of today, e.g.
 * { sunrise: '6:38am', sunset: '7:36pm', now: 'cloud', sunLeftMin: 0, nextSun: '5pm',
 *   hours: ['2pm cloud 13° 2%', …] }
 *
 * @param {object|null} forecast deriveSunForecast() result
 * @param {object|null} weather WeatherContext weather (for temperature and rain chance)
 * @param {{ maxHours?: number, now?: Date }} [options] `now` must be the one the forecast was built with
 */
export function forecastSummary(forecast, weather, { maxHours = 12, now = new Date() } = {}) {
    if (!forecast || forecast.sunriseHour == null || forecast.sunsetHour == null) return null;
    const hourly = weather?.hourly;
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const offset = Number.isFinite(forecast.utcOffsetSeconds) ? forecast.utcOffsetSeconds : 0;
    const today = new Date(now.getTime() + offset * 1000).toISOString().slice(0, 10);

    const hours = [];
    if (forecast.hasHourly) {
        for (let h = Math.floor(forecast.nowHour); h < 24 && hours.length < maxHours; h += 1) {
            const i = times.indexOf(`${today}T${String(h).padStart(2, '0')}:00`);
            const temp = i >= 0 ? Number(hourly.temperature_2m?.[i]) : NaN;
            const rain = i >= 0 ? Number(hourly.precipitation_probability?.[i]) : NaN;
            const parts = [formatHour(h), KIND_WORD[forecast.hours[h]?.kind] ?? 'day'];
            if (Number.isFinite(temp)) parts.push(`${Math.round(temp)}°`);
            if (Number.isFinite(rain)) parts.push(`${Math.round(rain)}%`);
            hours.push(parts.join(' '));
        }
    }
    return {
        sunrise: formatHour(forecast.sunriseHour),
        sunset: formatHour(forecast.sunsetHour),
        now: KIND_WORD[forecast.now?.kind] ?? 'unknown',
        sunLeftMin: forecast.sunMinutesLeft ?? null,
        nextSun: forecast.nextSunHour != null ? formatHour(forecast.nextSunHour) : null,
        hours,
    };
}

// Conditions, not amenities: the forecast already says whether it's sunny.
const SKIP_TAGS = new Set(['sunny', 'sunny now', 'windy', 'calm', 'exposed']);

/** The venue's first few amenity tags, as written. */
export function topTags(venue, n = 3) {
    if (!Array.isArray(venue?.tags)) return [];
    const out = [];
    for (const tag of venue.tags) {
        if (typeof tag !== 'string') continue;
        const key = normaliseTag(tag);
        if (!key || SKIP_TAGS.has(key)) continue;
        out.push(tag.trim().slice(0, 32));
        if (out.length >= n) break;
    }
    return out;
}
