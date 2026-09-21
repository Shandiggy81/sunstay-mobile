import { finiteOrNull } from './finiteOrNull.js';

export const MS_TO_KMH = 3.6;

/**
 * Convert a wind value to km/h.
 * Open-Meteo `wind_speed_unit=kmh` (the API default) is already km/h.
 * Pass `{ from: 'ms' }` only for genuine metre-per-second inputs.
 */
export function toWindKmh(value, { from = 'kmh' } = {}) {
    const n = finiteOrNull(value);
    if (n == null) return null;
    return from === 'ms' ? n * MS_TO_KMH : n;
}

export function toWindGustsKmh(value, { from = 'kmh' } = {}) {
    return toWindKmh(value, { from });
}

function gustSeries(hourly) {
    if (Array.isArray(hourly?.wind_gusts_10m)) return hourly.wind_gusts_10m;
    if (Array.isArray(hourly?.windgusts_10m)) return hourly.windgusts_10m;
    return null;
}

/**
 * Read an Open-Meteo hourly gust series as km/h.
 * Default contract is km/h; `{ from: 'ms' }` is the only m/s fallback.
 */
export function hourlyWindGustsKmh(hourly, hourIndex = 0, { from = 'kmh' } = {}) {
    const series = gustSeries(hourly);
    if (!series) return null;
    const raw = series[hourIndex] ?? series[0];
    return toWindGustsKmh(raw, { from });
}

/**
 * Peek-card gust chip from WeatherContext / Open-Meteo weather.
 * `windGusts` and `windGustsKmh` are km/h. Do not convert `wind.speed` (m/s).
 */
export function peekCardGustChip(weather, { minKmh = 20 } = {}) {
    const gustsKmh = toWindGustsKmh(weather?.windGustsKmh) ?? toWindGustsKmh(weather?.windGusts);
    const rounded = gustsKmh != null ? Math.round(gustsKmh) : null;
    const visible = rounded != null && rounded > minKmh;
    return {
        gustsKmh: rounded,
        visible,
        label: visible ? `${rounded}km/h gusts` : null,
    };
}

/**
 * ChatWidget / Sunny wind in km/h.
 * Prefers normalized `windKmh` (top-level WeatherContext or nested adapter).
 * `current.windSpeed` and `wind.speed` are m/s and convert once.
 */
export function chatWindKmh(weather) {
    if (!weather) return null;
    const nested = weather.current;
    return toWindKmh(nested?.windKmh)
        ?? toWindKmh(weather.windKmh)
        ?? toWindKmh(nested?.windSpeed, { from: 'ms' })
        ?? toWindKmh(weather.wind?.speed, { from: 'ms' });
}

export function chatWindLabel(weather) {
    const kmh = chatWindKmh(weather);
    if (kmh == null) return null;
    return `${Math.round(kmh)} km/h`;
}
