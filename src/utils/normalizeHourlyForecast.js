/**
 * Normalises an Open-Meteo hourly payload into rows the forecast strip can
 * render.
 *
 * Open-Meteo silently omits any series it cannot serve for a coordinate, and it
 * has shipped two spellings for several fields (`weather_code` vs
 * `weathercode`). Reading those series positionally is therefore unsafe: a
 * missing one throws on index access, and a short one yields NaN that reaches
 * the UI as "NaN°". Every series is read defensively here instead, and a row is
 * only emitted once it has both a valid timestamp and a finite temperature.
 */

import { finiteOrNull, firstFinite } from './finiteOrNull.js';
import { toWindGustsKmh } from './windUnits.js';

/**
 * @param {object} payload Raw Open-Meteo forecast response.
 * @param {{ now?: Date, limit?: number }} [options]
 * @returns {Array<object>} Rows from `now` onwards, never longer than `limit`.
 */
export function normalizeHourlyForecast(payload, { now = new Date(), limit = 12, windSpeedUnit = 'kmh' } = {}) {
    const hourly = payload?.hourly;
    const times = hourly?.time;
    // A truthy-but-not-array `time` is the shape that used to throw on `.map`.
    if (!Array.isArray(times)) return [];

    const from = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
    const cap = Number.isFinite(limit) && limit > 0 ? limit : times.length;

    const rows = [];
    for (let i = 0; i < times.length && rows.length < cap; i++) {
        const time = new Date(times[i]);
        if (Number.isNaN(time.getTime())) continue;
        if (time.getTime() < from) continue;

        // Temperature is the one field a row cannot be rendered without.
        const temp = finiteOrNull(hourly.temperature_2m?.[i]);
        if (temp === null) continue;

        const gustsKmh = toWindGustsKmh(
            firstFinite(hourly.wind_gusts_10m?.[i], hourly.windgusts_10m?.[i]),
            { from: windSpeedUnit }
        ) ?? 0;

        rows.push({
            time,
            temp: Math.round(temp),
            feelsLike: Math.round(firstFinite(hourly.apparent_temperature?.[i]) ?? temp),
            code: firstFinite(hourly.weather_code?.[i], hourly.weathercode?.[i]) ?? 0,
            precip: firstFinite(hourly.precipitation_probability?.[i]) ?? 0,
            clouds: firstFinite(hourly.cloud_cover?.[i], hourly.cloudcover?.[i]) ?? 0,
            gusts: Math.round(gustsKmh),
            rainMm: (firstFinite(hourly.precipitation?.[i]) ?? 0).toFixed(1),
            visibility: Math.round((firstFinite(hourly.visibility?.[i]) ?? 10000) / 1000),
            sunshineMins: Math.round((firstFinite(hourly.sunshine_duration?.[i]) ?? 0) / 60),
            solarW: Math.round(firstFinite(hourly.shortwave_radiation?.[i]) ?? 0),
        });
    }

    return rows;
}

/**
 * Hours of usable direct sun in the payload's first day.
 *
 * Returns null when the irradiance series is absent, so the caller can hide the
 * badge rather than claim "0 mins direct sun today" on missing data.
 *
 * @param {object} payload Raw Open-Meteo forecast response.
 * @param {number} [hours] How many leading hours to consider.
 * @returns {number|null}
 */
export function countDirectSunHours(payload, hours = 24) {
    const hourly = payload?.hourly;
    const irradiance = hourly?.direct_normal_irradiance;
    if (!Array.isArray(irradiance)) return null;

    const span = Math.min(Number.isFinite(hours) ? hours : irradiance.length, irradiance.length);
    let count = 0;
    for (let i = 0; i < span; i++) {
        const dni = finiteOrNull(irradiance[i]) ?? 0;
        const cloud = firstFinite(hourly.cloud_cover?.[i], hourly.cloudcover?.[i]) ?? 0;
        if (dni > 200 && cloud < 60) count += 1;
    }
    return count;
}
