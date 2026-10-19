/**
 * "Sun moments": when direct sun reaches a room or an outdoor area today,
 * told as the moments people care about — morning coffee, long lunch,
 * afternoon, sunset drinks — with the forecast sky for each.
 *
 * Geometry comes from balconySunEngine (the sun's real path plus the
 * buildings around the venue). Hotel rooms pass their facade and horizon;
 * bars and cafes pass the 36-sector building horizon stored on their
 * microclimate profile (sun_horizon_deg) and no facing.
 */
import { calculateBalconySunDay } from './balconySunEngine.js';
import { venueHour, venueTimeAt } from './venueTime.js';

const HOUR = 3600 * 1000;

/** Moment definitions: local hours [from, to). Sunset drinks use the last 90 minutes before sunset. */
export const SUN_MOMENTS = Object.freeze([
    { key: 'coffee', title: 'Morning coffee', icon: 'coffee', from: 6, to: 10 },
    { key: 'lunch', title: 'Long lunch', icon: 'dining', from: 12, to: 14.5 },
    { key: 'afternoon', title: 'Afternoon', icon: 'afternoon-sun', from: 14.5, to: 17 },
    { key: 'sunset', title: 'Sunset drinks', icon: 'cocktail', sunset: true },
]);

/**
 * 36-sector horizon (degrees, index 0 = bearings 0–10°) → engine obstructions.
 * Sectors at or below 0.5° are left out; values are clamped to the engine's 0–90°.
 */
export function horizonToObstructions(horizon) {
    if (!Array.isArray(horizon) || horizon.length !== 36) return null;
    const out = [];
    horizon.forEach((value, i) => {
        const deg = Number(value);
        if (!Number.isFinite(deg) || deg <= 0.5) return;
        out.push({ start: i * 10, end: i * 10 + 10, minAltitude: Math.min(89.9, deg) });
    });
    return out;
}

function overlap(windows, from, to) {
    return windows
        .map(({ start, end }) => [Math.max(start.getTime(), from), Math.min(end.getTime(), to)])
        .filter(([a, b]) => b - a >= 5 * 60 * 1000)
        .map(([a, b]) => ({ start: new Date(a), end: new Date(b) }));
}

/** Local wall-clock hour (decimal) of an instant in a time zone. */
function localHour(instant, timeZone) {
    return venueHour(instant, timeZone);
}

/**
 * The forecast sky over a set of windows: 'sun' if any forecast hour inside
 * is sunny, else the first non-sun kind ('cloud' | 'rain'), or null without
 * a forecast for today.
 */
function skyFor(windows, forecast, timeZone) {
    if (!forecast?.hasHourly || !Array.isArray(forecast.hours) || windows.length === 0) return null;
    const kinds = [];
    for (const w of windows) {
        for (let t = w.start.getTime(); t < w.end.getTime(); t += HOUR / 2) {
            const h = Math.floor(localHour(new Date(t), timeZone));
            const kind = forecast.hours[h]?.kind;
            if (kind) kinds.push(kind);
        }
    }
    if (kinds.includes('sun')) return 'sun';
    return kinds.find((k) => k === 'rain' || k === 'cloud') ?? null;
}

/**
 * @param {object} input
 * @param {object} input.daily calculateBalconySunDay() result
 * @param {object|null} [input.forecast] deriveSunForecast() result for the same day (optional)
 * @param {string} [input.timeZone]
 * @returns {{ totalMinutes: number, windows: Array<{start: Date, end: Date}>, moments: Array<{ key: string, title: string, icon: string, available: boolean|null, windows: Array<{start: Date, end: Date}>, sky: string|null }> }}
 */
export function sunMomentsFromDay({ daily, forecast = null, timeZone = 'Australia/Melbourne' }) {
    const windows = daily?.windows ?? [];
    const dayStart = daily?.dayStart instanceof Date ? daily.dayStart.getTime() : null;
    const moments = SUN_MOMENTS.map((m) => {
        let range = null;
        if (m.sunset) {
            const sunset = daily?.sunset instanceof Date ? daily.sunset.getTime() : null;
            if (sunset != null) range = [sunset - 1.5 * HOUR, sunset];
        } else if (dayStart != null) {
            range = [venueTimeAt(daily.dayStart, m.from, timeZone).getTime(), venueTimeAt(daily.dayStart, m.to, timeZone).getTime()];
        }
        if (!range) return { key: m.key, title: m.title, icon: m.icon, available: null, windows: [], sky: null };
        const hits = overlap(windows, range[0], range[1]);
        return {
            key: m.key, title: m.title, icon: m.icon,
            available: hits.length > 0,
            windows: hits,
            sky: hits.length ? skyFor(hits, forecast, timeZone) : null,
        };
    });
    return { totalMinutes: daily?.totalMinutes ?? 0, windows, moments };
}

/**
 * Today's sun for a bar, cafe or other outdoor area from its stored horizon.
 * @returns {ReturnType<typeof calculateBalconySunDay>|null} null without a usable horizon
 */
export function outdoorSunDay({ lat, lng, horizon, date, timeZone = 'Australia/Melbourne' }) {
    const obstructions = horizonToObstructions(horizon);
    const la = Number(lat), ln = Number(lng);
    if (!obstructions || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
    try {
        return calculateBalconySunDay({ lat: la, lng: ln, facing: null, obstructions, date, timeZone });
    } catch {
        return null;
    }
}

/** A stored horizon if it is 36 finite numbers, else null. */
export function parseSunHorizon(value) {
    if (!Array.isArray(value) || value.length !== 36) return null;
    if (value.some((v) => v == null || v === '')) return null;
    const numbers = value.map(Number);
    return numbers.every(Number.isFinite) ? numbers : null;
}

/**
 * Rooms sorted sunniest-first for a date (venue-local YYYY-MM-DD). Rooms the
 * engine cannot place keep their order at the end. `pinned` (the best room
 * for a chosen sun moment) always comes first.
 */
export function roomsBySunToday(rooms, venue, date, pinned = null) {
    if (!Array.isArray(rooms)) return [];
    const lat = Number(venue?.lat), lng = Number(venue?.lng);
    const timeZone = venue?.timeZone ?? venue?.timezone ?? 'Australia/Melbourne';
    const minutes = (room) => {
        try {
            return calculateBalconySunDay({ lat, lng, facing: room?.orientation, obstructions: room?.obstructions ?? [],
                overhang: room?.overhang ?? null, date, timeZone }).totalMinutes;
        } catch { return -1; }
    };
    return rooms
        .map((room, index) => ({ room, index, m: room === pinned ? Infinity : minutes(room) }))
        .sort((a, b) => b.m - a.m || a.index - b.index)
        .map((x) => x.room);
}
