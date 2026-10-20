/**
 * Today's sun for a café list row, from exactly the same chain as the café
 * detail card: outdoorSunDay → roundedSunDay → cardSunWindows, with the total
 * from layoutSunWindows. The row's "Xh Ym sun today" therefore always equals
 * the detail headline for the same venue, horizon and date.
 *
 * @module utils/cafeRowSun
 */
import { outdoorSunDay } from './sunMoments.js';
import { cardSunWindows, roundedSunDay } from './sunWindowsCard.js';
import { layoutSunWindows } from './sunWindowsGraph.js';

/**
 * @param {{ lat: number, lng: number, horizon: number[]|null, date: string, timeZone: string }} input
 * @returns {null | {
 *   sun: ReturnType<typeof cardSunWindows>,
 *   totalMinutes: number,
 *   totalLabel: string,
 *   windowCount: number,
 * }} null without a usable horizon or position
 */
export function rowSunDay({ lat, lng, horizon, date, timeZone }) {
    const daily = roundedSunDay(outdoorSunDay({ lat, lng, horizon, date, timeZone }));
    const sun = cardSunWindows(daily);
    if (!sun) return null;
    let layout;
    try { layout = layoutSunWindows(sun); } catch { return null; }
    return { sun, totalMinutes: layout.totalMinutes, totalLabel: layout.totalLabel, windowCount: layout.windowCount };
}

/** "3h 3m sun today", "No direct sun today", or null without a result. */
export function rowSunLine(rowSun) {
    if (!rowSun) return null;
    return rowSun.windowCount > 0 ? `${rowSun.totalLabel} sun today` : 'No direct sun today';
}

/** Cache key: one result per venue per venue-local date. */
export function rowSunKey(venueId, date) {
    return `${venueId}|${date}`;
}

/**
 * A small least-recently-used cache, so scrolling back to a row is instant
 * without keeping every venue's day for ever.
 */
export function createLruCache(limit) {
    const max = Number.isInteger(limit) && limit > 0 ? limit : 1;
    const map = new Map();
    return {
        get(key) {
            if (!map.has(key)) return undefined;
            const value = map.get(key);
            map.delete(key);
            map.set(key, value);
            return value;
        },
        set(key, value) {
            map.delete(key);
            map.set(key, value);
            if (map.size > max) map.delete(map.keys().next().value);
        },
        get size() { return map.size; },
    };
}

/**
 * The mini graph's axis for a list row: sunrise to sunset. Every row then
 * shares the same daylight span (same city and date), so hill widths compare
 * down the list, instead of each row fitting its own windows. Windows never
 * fall outside it: the engine only finds sun above the horizon, and minute
 * rounding keeps that order. {} when the day has no sunrise/sunset.
 */
export function rowSunAxis(sun) {
    const start = sun?.sunrise;
    const end = sun?.sunset;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return {};
    return { axisStart: start, axisEnd: end };
}
