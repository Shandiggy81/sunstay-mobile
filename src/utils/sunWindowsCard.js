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
