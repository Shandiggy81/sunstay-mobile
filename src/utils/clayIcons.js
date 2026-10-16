/**
 * Clay icon names for weather and venues. Values are file names in
 * src/assets/clay/ without `.webp`; components turn them into URLs with
 * `clayIconUrls(import.meta.glob(...))` from clayFilterIcons.js.
 */

import { pinIconName } from './clayVenuePins.js';

/**
 * Clay icon for an Open-Meteo WMO weather code.
 *
 * @param {number|null|undefined} code
 * @param {{ isNight?: boolean }} [options]
 * @returns {string}
 */
export function weatherIconName(code, { isNight = false } = {}) {
    const c = Number(code);
    if (code == null || !Number.isFinite(c)) return isNight ? 'night' : 'sun-cloud';
    if (c === 0 || c === 1) return isNight ? 'night' : 'sun';
    if (c === 2) return isNight ? 'night' : 'sun-cloud';
    if (c === 3) return 'cloud';
    if (c === 45 || c === 48) return 'fog';
    // Drizzle and passing showers read as "sun shower" by day.
    if ((c >= 51 && c <= 57) || (c >= 80 && c <= 82)) return isNight ? 'rain' : 'sun-shower';
    if (c >= 61 && c <= 67) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'frost';
    if (c >= 95) return 'thunderstorm';
    return isNight ? 'night' : 'sun-cloud';
}

const KIND_ICONS = Object.freeze({
    sun: 'sun',
    cloud: 'cloud',
    rain: 'rain',
    night: 'night',
    shaded: 'shaded',
});

/** Clay icon for a deriveSunForecast() hour kind ('sun', 'cloud', 'rain', 'night', 'shaded', …). */
export function forecastKindIconName(kind) {
    return Object.prototype.hasOwnProperty.call(KIND_ICONS, kind) ? KIND_ICONS[kind] : 'sun-cloud';
}

/** Below this feels-like temperature the card suggests a jacket. */
export const JACKET_BELOW_C = 16;

/** Jacket when it feels cool, thermometer otherwise. */
export function feelsLikeIconName(feelsLikeC) {
    const t = Number(feelsLikeC);
    return feelsLikeC != null && Number.isFinite(t) && t < JACKET_BELOW_C ? 'jacket' : 'thermometer';
}

/** The venue's own clay icon (its map-pin icon), or a clay map pin. */
export function venueIconName(venue) {
    return pinIconName(venue) ?? 'map-pin';
}

/**
 * What a venue's list row or card shows, matching its map pin: its clay icon
 * ({ name }), else its own emoji ({ emoji }, e.g. 🥡 🍨 🥐), else a clay map pin.
 */
export function venueIcon(venue) {
    const name = pinIconName(venue);
    if (name) return { name };
    const emoji = typeof venue?.emoji === 'string' ? venue.emoji.trim() : '';
    return emoji ? { emoji } : { name: 'map-pin' };
}
