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
import { formatDuration, formatHour, RAIN_CHANCE_PCT } from './sunForecastState.js';
import { venueHour, venueUtcOffsetSeconds } from './venueTime.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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

/**
 * Minutes of clear-sky sun windows that the forecast also gives direct sun:
 * the part of each window that falls in a deriveSunForecast hour of kind
 * 'sun' (venue-local hour slots). Cloud, rain and hours without a forecast
 * count as no sun. `from` (epoch ms) counts only what is still to come.
 *
 * @param {{ windows: Array<{ start: Date|number, end: Date|number }>|null, forecast: object|null,
 *   timeZone?: string, from?: number|null }} input
 * @returns {number|null} minutes, or null without an hourly forecast
 */
export function forecastSunMinutes({ windows, forecast, timeZone = 'Australia/Melbourne', from = null } = {}) {
    if (!forecast?.hasHourly || !Array.isArray(forecast.hours) || !Array.isArray(windows)) return null;
    let total = 0;
    for (const window of windows) {
        const end = instantMs(window?.end);
        let t = instantMs(window?.start);
        if (!Number.isFinite(t) || !Number.isFinite(end)) continue;
        if (Number.isFinite(from)) t = Math.max(t, from);
        while (t < end) {
            // Step to the next venue-local hour; the offset is re-read each hour for daylight saving.
            const offset = venueUtcOffsetSeconds(new Date(t), timeZone) * 1000;
            const local = t + offset;
            const stop = Math.min(end, (Math.floor(local / HOUR) + 1) * HOUR - offset);
            if (forecast.hours[new Date(local).getUTCHours()]?.kind === 'sun') total += (stop - t) / MINUTE;
            t = stop;
        }
    }
    return total;
}

/**
 * How a clear-sky sun total for today reads beside the forecast. The total
 * is buildings and the sun's path on a clear day; when the forecast gives
 * this spot less sun than that (or there is no forecast to check it with),
 * the figure is labelled "on a clear day" and the forecast's own amount is
 * said beside it. A fully sunny forecast leaves the wording as "today".
 *
 * @param {{ totalMinutes: number, windows: Array<object>|null, forecast: object|null, timeZone?: string }} input
 * @returns {{ clearSky: boolean, forecastMinutes: number|null, forecastText: string|null }}
 *   forecastText: "No direct sun forecast today" or "About 3h forecast today", null when it adds nothing
 */
export function clearSkyTotal({ totalMinutes, windows, forecast, timeZone = 'Australia/Melbourne' } = {}) {
    const total = Number.isFinite(totalMinutes) ? Math.max(0, totalMinutes) : 0;
    if (total <= 0) return { clearSky: false, forecastMinutes: null, forecastText: null };
    const minutes = forecastSunMinutes({ windows, forecast, timeZone });
    if (minutes == null) return { clearSky: true, forecastMinutes: null, forecastText: null };
    const forecastMinutes = Math.round(minutes);
    // Rounding: windows that are all sunny give the total back to within a minute.
    if (forecastMinutes >= Math.round(total) - 1) return { clearSky: false, forecastMinutes, forecastText: null };
    return {
        clearSky: true,
        forecastMinutes,
        forecastText: forecastMinutes > 0 ? `About ${formatDuration(forecastMinutes)} forecast today` : 'No direct sun forecast today',
    };
}

/**
 * The venue card's rain row: when forecast rain first falls inside the sun
 * still to come today, from deriveSunForecast's hour slots after its nowHour.
 * `sun` is cardSunWindows() for the venue; without building windows (null or
 * empty) daylight stands in, and the "cuts today's sun short" clause is left out.
 * "likely" from RAIN_CHANCE_PCT (or no chance given), else "possible".
 *
 * @param {{ forecast: object|null, sun?: ReturnType<typeof cardSunWindows>|null }} input
 * @returns {null | { title: string, detail: string|null, hour: number }}
 *   e.g. { title: 'Rain likely from 1pm', detail: "68% at 1pm · 100% by 3pm · cuts today's sun short", hour: 13 };
 *   null without an hourly forecast or with no rain hour ahead in the sun
 */
export function rainDuringSun({ forecast, sun = null }) {
    if (!forecast?.hasHourly || !Array.isArray(forecast.hours) || !Number.isFinite(forecast.nowHour)) return null;
    const buildings = Boolean(sun?.windows?.length);
    const ranges = buildings
        ? sun.windows.map(({ start, end }) => [venueHour(start, sun.timezone), venueHour(end, sun.timezone)])
        : Number.isFinite(forecast.sunriseHour) && Number.isFinite(forecast.sunsetHour)
            ? [[forecast.sunriseHour, forecast.sunsetHour]] : [];
    const ahead = new Set();
    for (const [from, to] of ranges) {
        for (let h = Math.floor(Math.max(from, forecast.nowHour)); h < to && h < 24; h += 1) ahead.add(h);
    }
    const rainy = [...ahead].sort((a, b) => a - b).filter((h) => forecast.hours[h]?.kind === 'rain');
    if (rainy.length === 0) return null;

    const chance = (h) => (Number.isFinite(forecast.hours[h]?.rainChance) ? forecast.hours[h].rainChance : null);
    const first = rainy[0];
    const firstChance = chance(first);
    let peak = first;
    for (const h of rainy) if ((chance(h) ?? -1) > (chance(peak) ?? -1)) peak = h;
    const likely = firstChance == null || firstChance >= RAIN_CHANCE_PCT ? 'likely' : 'possible';
    const detail = [
        firstChance != null ? `${firstChance}% at ${formatHour(first)}` : null,
        peak !== first && chance(peak) != null ? `${chance(peak)}% by ${formatHour(peak)}` : null,
        buildings ? "cuts today's sun short" : null,
    ].filter(Boolean);
    return {
        // Rain in the current reading is happening now (skyNow.js), not just likely.
        title: first <= forecast.nowHour
            ? (forecast.now?.rain === 'raining' ? 'Raining now' : `Rain ${likely} now`)
            : `Rain ${likely} from ${formatHour(first)}`,
        detail: detail.length ? detail.join(' · ') : null,
        hour: first,
    };
}
