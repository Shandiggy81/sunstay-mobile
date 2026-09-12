/**
 * Pair live Open-Meteo weather + venue exposure with calculateSunstayScore.
 *
 * Keeps the cozy-index module free of React and suncalc. Sun geometry comes
 * from getSunPositionForMap (0=N clockwise), matching calculateSunstayScore.
 */
import { calculateSunstayScore } from './calculateSunstayScore.js';
import { getSunPositionForMap } from './sunPosition.js';
import { getVenueFacingBearing } from '../data/sunshineIntelligence.js';
import { getCurrentHourlyIndex, wallClockHourKey } from './weatherService.js';

const MELBOURNE_COORDS = { lat: -37.8136, lng: 144.9631 };
const FALLBACK_RESULT = { score: 75, label: 'Great Conditions' };

const INDOOR_TAGS = new Set(['indoor', 'indoor warmth']);
const COVERED_TAGS = new Set(['covered', 'fireplace']);
const PARTIAL_TAGS = new Set(['shaded', 'umbrellas', 'shade']);

function toFiniteNumber(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function tagList(venue) {
    return (venue?.tags || []).map((t) => String(t).trim().toLowerCase());
}

/**
 * Map venue tags / shielding / explicit exposure onto OPEN|PARTIAL|COVERED|INDOOR.
 * @param {object|null|undefined} venue
 * @returns {'OPEN'|'PARTIAL'|'COVERED'|'INDOOR'}
 */
export function deriveVenueExposure(venue) {
    if (!venue) return 'OPEN';
    const explicit = venue.exposure ?? venue.exposureClass ?? venue.seatingExposure;
    if (explicit != null && String(explicit).trim() !== '') {
        return String(explicit).trim().toUpperCase();
    }

    const indoorPct = toFiniteNumber(venue.indoorPercentage ?? venue.indoor_percentage, 0) ?? 0;
    if (indoorPct >= 80) return 'INDOOR';

    const tags = tagList(venue);
    if (tags.some((t) => INDOOR_TAGS.has(t))) return 'INDOOR';

    const rainCover = toFiniteNumber(venue.shielding?.rainCover);
    const flaggedCovered = Boolean(
        venue.coveredOutdoor ??
        venue.covered_outdoor ??
        venue.hasCover,
    );
    if (
        tags.some((t) => COVERED_TAGS.has(t)) ||
        flaggedCovered ||
        (rainCover != null && rainCover >= 60)
    ) {
        return 'COVERED';
    }

    if (tags.some((t) => PARTIAL_TAGS.has(t))) return 'PARTIAL';
    return 'OPEN';
}

/**
 * Compass facing of the unshaded outdoor exposure.
 * Explicit fields win; otherwise infer (degrees 0=N).
 * @param {object|null|undefined} venue
 * @returns {string|number|null}
 */
export function deriveVenueFacing(venue) {
    if (!venue) return null;
    const explicit = venue.venueExposureFacing
        ?? venue.outdoorZone?.aspect
        ?? venue.outdoor_aspect
        ?? venue.outdoorAspect
        ?? venue.balcony_facing
        ?? venue.orientation
        ?? venue.roomTypes?.[0]?.orientation;
    if (explicit != null && String(explicit).trim() !== '' && String(explicit).toLowerCase() !== 'open') {
        return explicit;
    }
    try {
        return getVenueFacingBearing(venue);
    } catch {
        return null;
    }
}

/**
 * Wind speed in km/h from the Open-Meteo-shaped weather object.
 * `wind.speed` is stored as m/s (OpenWeather-compatible); `windKmh` is native.
 */
export function windKmhFromWeather(weather) {
    if (!weather) return 0;
    const native = toFiniteNumber(weather.windKmh);
    if (native != null) return native;
    const ms = toFiniteNumber(weather.wind?.speed, 0) ?? 0;
    return ms * 3.6;
}

/**
 * Rain probability 0–100 from current hourly slot (or raining-now fallback).
 */
export function rainProbabilityFromWeather(weather) {
    if (!weather) return 0;
    const direct = toFiniteNumber(weather.precipProbability ?? weather.rainChance);
    if (direct != null) return direct;
    const idx = weather.hourly?._currentIndex;
    const hourly = weather.hourly?.precipitation_probability;
    if (Number.isFinite(idx) && Array.isArray(hourly) && Number.isFinite(hourly[idx])) {
        return hourly[idx];
    }
    if ((weather.precipitation ?? 0) > 0) return 70;
    return 0;
}

function sunPositionForVenue(venue, now) {
    const lat = toFiniteNumber(venue?.lat) ?? MELBOURNE_COORDS.lat;
    const lng = toFiniteNumber(venue?.lng ?? venue?.lon) ?? MELBOURNE_COORDS.lng;
    return getSunPositionForMap(lat, lng, now);
}

function tzOffsetFromWeather(weather) {
    return toFiniteNumber(weather?.hourly?._tzOffsetSeconds ?? weather?.utcOffsetSeconds, 36000) ?? 36000;
}

/**
 * True when `at` falls in the live “now” hourly slot (or the same Melbourne
 * wall-clock hour when hourly index metadata is missing).
 * @param {object|null|undefined} weather
 * @param {Date} at
 * @returns {boolean}
 */
export function isLiveScoreTimestamp(weather, at) {
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) return true;
    const tz = tzOffsetFromWeather(weather);
    const hourly = weather?.hourly;
    if (hourly?.time?.length && Number.isFinite(hourly._currentIndex)) {
        return getCurrentHourlyIndex(hourly, tz, at) === hourly._currentIndex;
    }
    return wallClockHourKey(at, tz) === wallClockHourKey(new Date(), tz);
}

function overlayHourlyWeather(weather, idx) {
    const hourly = weather.hourly;
    const temp = toFiniteNumber(hourly.temperature_2m?.[idx]);
    const apparent = toFiniteNumber(hourly.apparent_temperature?.[idx]);
    const windKmh = toFiniteNumber(hourly.wind_speed_10m?.[idx]);
    const precip = toFiniteNumber(hourly.precipitation_probability?.[idx]);
    const uv = toFiniteNumber(hourly.uv_index?.[idx]);
    const clouds = toFiniteNumber(hourly.cloud_cover?.[idx]);
    const gusts = toFiniteNumber(hourly.wind_gusts_10m?.[idx]);

    return {
        ...weather,
        main: {
            ...weather.main,
            temp: temp ?? weather.main?.temp,
            feels_like: apparent ?? weather.main?.feels_like,
        },
        wind: {
            ...weather.wind,
            speed: windKmh != null ? windKmh / 3.6 : weather.wind?.speed,
        },
        windKmh: windKmh ?? weather.windKmh,
        windGusts: gusts ?? weather.windGusts,
        uvi: uv ?? weather.uvi,
        precipProbability: precip ?? weather.precipProbability,
        cloudCoverPct: clouds ?? weather.cloudCoverPct,
        clouds: { all: clouds ?? weather.clouds?.all },
        apparentTemp: apparent ?? weather.apparentTemp,
    };
}

/**
 * Weather object used for scoring at `at`. Live current-hour timestamps keep
 * the original current fields so the result matches today’s live score.
 * @param {object|null|undefined} weather
 * @param {Date|null|undefined} at
 * @returns {object|null|undefined}
 */
export function weatherForScoreTime(weather, at) {
    if (!weather || !(at instanceof Date) || Number.isNaN(at.getTime())) return weather;
    if (isLiveScoreTimestamp(weather, at)) return weather;
    const hourly = weather.hourly;
    if (!hourly?.time?.length) return weather;
    const idx = getCurrentHourlyIndex(hourly, tzOffsetFromWeather(weather), at);
    return overlayHourlyWeather(weather, idx);
}

/**
 * Build calculateSunstayScore input from live Open-Meteo weather + a venue.
 *
 * @param {object|null|undefined} weather
 * @param {object|null|undefined} venue
 * @param {object} [options]
 * @param {Date} [options.at] - settled Melbourne instant; pulls hourly forecast + sun at that time
 * @param {Date} [options.now]
 * @param {{ azimuth?: number, altitude?: number }|null} [options.sun] - skip suncalc when provided
 * @returns {import('./calculateSunstayScore').SunstayScoreInput}
 */
export function buildSunstayScoreInput(weather, venue, options = {}) {
    const explicitAt = options.at instanceof Date && !Number.isNaN(options.at.getTime())
        ? options.at
        : null;
    const useLiveNow = !explicitAt || isLiveScoreTimestamp(weather, explicitAt);
    const now = useLiveNow
        ? (options.now instanceof Date ? options.now : new Date())
        : explicitAt;
    const scoredWeather = explicitAt ? weatherForScoreTime(weather, explicitAt) : weather;
    const sun = options.sun === null
        ? { azimuth: null, altitude: null }
        : options.sun ?? sunPositionForVenue(venue, now);

    return {
        temperatureC: toFiniteNumber(scoredWeather?.main?.temp ?? scoredWeather?.apparentTemp ?? scoredWeather?.temp),
        windKmh: windKmhFromWeather(scoredWeather),
        rainProbability: rainProbabilityFromWeather(scoredWeather),
        uvIndex: toFiniteNumber(scoredWeather?.uvi ?? scoredWeather?.uvIndex),
        sunAzimuthDeg: toFiniteNumber(sun?.azimuth ?? sun?.azimuthDeg),
        sunAltitudeDeg: toFiniteNumber(sun?.altitude ?? sun?.altitudeDeg),
        venueExposureFacing: deriveVenueFacing(venue),
        exposure: deriveVenueExposure(venue),
    };
}

/**
 * @param {object|null|undefined} weather
 * @param {object|null|undefined} venue
 * @param {object} [options]
 * @param {Date} [options.at] - settled timestamp; hourly forecast + sun at that instant
 * @returns {{ score: number, label: string }}
 */
export function scoreVenueFromWeather(weather, venue, options = {}) {
    if (!weather) return { ...FALLBACK_RESULT };
    return calculateSunstayScore(buildSunstayScoreInput(weather, venue, options));
}
