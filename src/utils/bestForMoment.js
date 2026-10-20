/**
 * "Best for …" on a venue sun card, chosen by rule from the day's sun windows
 * (docs/design/venue-sun-cards-brief.md §3), never free text.
 *
 * Each SUN_MOMENTS moment (morning coffee 6–10am, long lunch 12–2:30pm,
 * afternoon 2:30–5pm, the last 90 minutes before sunset) qualifies when direct
 * sun covers at least BEST_FOR_MIN_SHARE of it. The best-covered moments win
 * (ties: the earlier moment), at most BEST_FOR_MAX_MOMENTS, shown in day order.
 *
 * @module utils/bestForMoment
 */
import { SUN_MOMENTS } from './sunMoments.js';
import { venueTimeAt } from './venueTime.js';

const MINUTE = 60_000;

export const BEST_FOR_MIN_SHARE = 0.5;
export const BEST_FOR_MAX_MOMENTS = 2;

/** Copy per venue type. Café copy comes first; other types use the moment titles until they get their own. */
export const BEST_FOR_COPY = Object.freeze({
    cafe: Object.freeze({
        coffee: 'morning coffee',
        lunch: 'a sunny lunch',
        afternoon: 'afternoon tea',
        sunset: 'golden-hour sun',
    }),
    default: Object.freeze(Object.fromEntries(SUN_MOMENTS.map((m) => [m.key, m.title.toLowerCase()]))),
});

function instantMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Date.parse(value);
    return Number.NaN;
}

function momentRange(moment, { date, timezone, sunset }) {
    if (moment.sunset) {
        const end = instantMs(sunset);
        return Number.isFinite(end) ? [end - 90 * MINUTE, end] : null;
    }
    try {
        return [venueTimeAt(date, moment.from, timezone).getTime(), venueTimeAt(date, moment.to, timezone).getTime()];
    } catch {
        return null;
    }
}

/**
 * @param {{ windows: Array<{start, end}>, date: string, timezone: string, sunset?: unknown }|null} sun
 *   cardSunWindows() output (any Date / epoch-ms / ISO window times work)
 * @param {{ venueType?: string }} [options]
 * @returns {null | { keys: string[], text: string }} null when no moment gets enough sun
 */
export function bestForMoment(sun, { venueType = 'cafe' } = {}) {
    if (!sun || !Array.isArray(sun.windows) || typeof sun.date !== 'string' || !sun.timezone) return null;
    const windows = sun.windows
        .map((w) => [instantMs(w?.start), instantMs(w?.end)])
        .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
    const copy = BEST_FOR_COPY[venueType] ?? BEST_FOR_COPY.default;

    const scored = [];
    SUN_MOMENTS.forEach((moment, order) => {
        const range = momentRange(moment, sun);
        if (!range || range[1] <= range[0]) return;
        const [from, to] = range;
        const sunMs = windows.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(end, to) - Math.max(start, from)), 0);
        const share = sunMs / (to - from);
        if (share >= BEST_FOR_MIN_SHARE) scored.push({ key: moment.key, order, share });
    });
    if (scored.length === 0) return null;

    const picked = scored
        .sort((a, b) => b.share - a.share || a.order - b.order)
        .slice(0, BEST_FOR_MAX_MOMENTS)
        .sort((a, b) => a.order - b.order);
    const keys = picked.map((m) => m.key);
    return { keys, text: `Best for ${keys.map((key) => copy[key]).join(' + ')}` };
}
