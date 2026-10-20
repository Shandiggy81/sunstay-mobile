/**
 * The sun engine's day (calculateBalconySunDay / outdoorSunDay) as props for
 * SunWindowsGraph on a venue card.
 *
 * The engine places window edges to about half a second, and the graph shows
 * whatever precision it is given, so raw edges read "8:50:16.845am" and the
 * total "8h 58m 15.41s". Here every edge is rounded to the nearest whole
 * minute first, so the chips, the graph's total and the card headline all
 * come from the same minute-aligned windows. The engine's own `totalMinutes`
 * rounds the unrounded windows once and can differ from the chips by a minute;
 * the headline must use the graph's total (layoutSunWindows) instead.
 *
 * @module utils/sunWindowsCard
 */
import { venueHour } from './venueTime.js';

const MINUTE = 60_000;

function instantMs(value) {
    if (value instanceof Date) return value.getTime();
    return typeof value === 'number' ? value : NaN;
}

// Rounding the UTC instant is the same as rounding the venue's clock, because
// every current IANA zone offset is a whole number of minutes.
const roundToMinute = (ms) => Math.round(ms / MINUTE) * MINUTE;

function roundedOrNull(value) {
    const ms = instantMs(value);
    return Number.isFinite(ms) ? roundToMinute(ms) : null;
}

/**
 * @param {object|null} daily calculateBalconySunDay() / outdoorSunDay() result
 * @returns {null | {
 *   windows: Array<{ start: number, end: number }>,
 *   date: string,
 *   timezone: string,
 *   sunrise: number|null,
 *   sunset: number|null,
 * }} Epoch-ms windows with whole-minute edges, sorted, with overlapping or
 *   touching windows merged and windows under a minute (after rounding)
 *   dropped. Null when the day is missing or any window is unreadable, so a
 *   card never shows part of a day as if it were all of it.
 */
export function cardSunWindows(daily) {
    if (!daily || !Array.isArray(daily.windows)) return null;
    if (typeof daily.date !== 'string' || typeof daily.timeZone !== 'string' || !daily.timeZone) return null;

    const rounded = [];
    for (const window of daily.windows) {
        const start = instantMs(window?.start);
        const end = instantMs(window?.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        const roundedStart = roundToMinute(start);
        const roundedEnd = roundToMinute(end);
        if (roundedEnd - roundedStart < MINUTE) continue;
        rounded.push({ start: roundedStart, end: roundedEnd });
    }
    rounded.sort((a, b) => a.start - b.start || a.end - b.end);

    const windows = [];
    for (const window of rounded) {
        const last = windows.at(-1);
        if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
        else windows.push({ ...window });
    }

    return {
        windows,
        date: daily.date,
        timezone: daily.timeZone,
        sunrise: roundedOrNull(daily.sunrise),
        sunset: roundedOrNull(daily.sunset),
    };
}

/**
 * The engine day with its windows replaced by the minute-rounded ones and
 * `totalMinutes` set to their sum, so everything else on the card that reads
 * a day (outdoorSunSummary's stat and sentence, sunMomentsFromDay) agrees
 * with the graph's total. Null when cardSunWindows would be.
 */
export function roundedSunDay(daily) {
    const card = cardSunWindows(daily);
    if (!card) return null;
    const windows = card.windows.map((w) => ({ start: new Date(w.start), end: new Date(w.end) }));
    const totalMinutes = card.windows.reduce((sum, w) => sum + (w.end - w.start) / MINUTE, 0);
    return { ...daily, windows, totalMinutes };
}

const SKY_TEXT = Object.freeze({
    sun: "Mostly sunny in today's sun windows",
    mixed: "Some sun forecast in today's sun windows",
    cloud: "Cloud forecast over today's sun windows",
    rain: "Rain forecast during today's sun windows",
});

/**
 * The forecast sky over the card's sun windows, read half-hourly from
 * deriveSunForecast's hours (venue-local hour slots, 'sun' | 'cloud' | 'rain'):
 * any rain → rain; at least 75% sun → sun; some sun → mixed; else cloud.
 * Kept apart from the sun numbers, which assume a clear day.
 *
 * @param {{ forecast: object|null, sun: ReturnType<typeof cardSunWindows> }} input
 * @returns {null | { kind: 'sun'|'mixed'|'cloud'|'rain', text: string }}
 *   null without an hourly forecast or without sun windows
 */
export function forecastForSunWindows({ forecast, sun }) {
    if (!forecast?.hasHourly || !Array.isArray(forecast.hours) || !sun?.windows?.length) return null;
    const kinds = [];
    for (const { start, end } of sun.windows) {
        for (let t = start; t < end; t += 30 * MINUTE) {
            const kind = forecast.hours[Math.floor(venueHour(t, sun.timezone))]?.kind;
            if (kind === 'sun' || kind === 'cloud' || kind === 'rain') kinds.push(kind);
        }
    }
    if (kinds.length === 0) return null;
    const sunShare = kinds.filter((k) => k === 'sun').length / kinds.length;
    const kind = kinds.includes('rain') ? 'rain' : sunShare >= 0.75 ? 'sun' : sunShare > 0 ? 'mixed' : 'cloud';
    return { kind, text: SKY_TEXT[kind] };
}
