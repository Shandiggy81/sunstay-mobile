/**
 * Best 2–3 hour Sunstay window from live Open-Meteo hourly scores.
 *
 * Uses the same pipeline as VenueCard / TOD settle: scoreVenueFromWeather
 * with `{ at }` for each Melbourne hourly instant. When no venue is passed,
 * hours are scored against a generic Melbourne CBD outdoor OPEN terrace.
 */
import { scoreVenueFromWeather } from './scoreFromOpenMeteo.js';
import { getCurrentHourlyIndex, openMeteoLocalTimeToDate } from './weatherService.js';

const MELBOURNE_OFFSET_SECONDS = 36000;

/** Neutral city-centre outdoor stub for weather-only getBestWindow calls. */
export const GENERIC_MELBOURNE_OPEN_VENUE = {
    name: 'Melbourne CBD (generic outdoor)',
    lat: -37.8136,
    lng: 144.9631,
    tags: ['Sunny'],
    exposure: 'OPEN',
};

const UNKNOWN_WINDOW = {
    type: 'UNKNOWN',
    label: '⚡ Checking conditions...',
    score: 0,
    startsInHours: null,
    start: null,
    end: null,
};

function tzOffsetFromWeather(weather) {
    const n = Number(weather?.hourly?._tzOffsetSeconds ?? weather?.utcOffsetSeconds);
    return Number.isFinite(n) ? n : MELBOURNE_OFFSET_SECONDS;
}

function windowEndDate(start, lengthHours) {
    return new Date(start.getTime() + lengthHours * 3600 * 1000);
}

/**
 * Highest-average contiguous 2- or 3-hour block.
 * Ties: higher average, then longer window, then earlier start.
 * @param {Array<{ score: number, label: string, at: Date, index: number, iso: string }>} slots
 */
function pickBestBlock(slots) {
    let best = null;
    for (const length of [3, 2]) {
        if (slots.length < length) continue;
        for (let i = 0; i <= slots.length - length; i++) {
            const slice = slots.slice(i, i + length);
            const avg = slice.reduce((sum, slot) => sum + slot.score, 0) / length;
            if (
                !best
                || avg > best.avg
                || (avg === best.avg && length > best.length)
            ) {
                const peak = slice.reduce((top, slot) => (slot.score > top.score ? slot : top));
                best = { slice, avg, length, peak };
            }
        }
    }
    return best;
}

/**
 * @param {object|null|undefined} weather - Open-Meteo-shaped weather from WeatherContext
 * @param {object} [options]
 * @param {number} [options.hoursAhead=8] - hours after the current slot to search
 * @param {object} [options.venue] - optional venue; defaults to generic Melbourne OPEN
 * @param {Date} [options.now]
 * @returns {{
 *   type: 'CURRENT_PEAK'|'FUTURE_WINDOW'|'UNKNOWN',
 *   label: string,
 *   score: number,
 *   startsInHours: number|null,
 *   start: Date|null,
 *   end: Date|null,
 * }}
 */
export function computeBestWindow(weather, options = {}) {
    const hoursAhead = Number.isFinite(Number(options.hoursAhead))
        ? Math.max(0, Math.floor(Number(options.hoursAhead)))
        : 8;
    const venue = options.venue ?? GENERIC_MELBOURNE_OPEN_VENUE;
    const now = options.now instanceof Date && !Number.isNaN(options.now.getTime())
        ? options.now
        : new Date();

    const hourly = weather?.hourly;
    if (!hourly?.time?.length) return { ...UNKNOWN_WINDOW };

    const tz = tzOffsetFromWeather(weather);
    const currentIndex = Number.isFinite(hourly._currentIndex)
        ? hourly._currentIndex
        : getCurrentHourlyIndex(hourly, tz, now);

    // Remaining hours ahead from the current slot (inclusive), bounded by hoursAhead.
    const lastIndex = Math.min(hourly.time.length - 1, currentIndex + hoursAhead);

    const slots = [];
    for (let i = currentIndex; i <= lastIndex; i++) {
        const iso = hourly.time[i];
        if (!iso) continue;
        const at = openMeteoLocalTimeToDate(iso, tz);
        if (!at) continue;
        const { score, label } = scoreVenueFromWeather(weather, venue, { at });
        slots.push({ index: i, iso, at, score, label });
    }

    const best = pickBestBlock(slots);
    if (!best) return { ...UNKNOWN_WINDOW };

    const startSlot = best.slice[0];
    const start = startSlot.at;
    const end = windowEndDate(start, best.length);
    const startsInHours = Math.max(0, startSlot.index - currentIndex);
    const type = startsInHours === 0 ? 'CURRENT_PEAK' : 'FUTURE_WINDOW';

    return {
        type,
        label: best.peak.label,
        score: best.peak.score,
        startsInHours,
        start,
        end,
    };
}
