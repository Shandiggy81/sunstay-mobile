/**
 * useWeatherCache — Cross-platform weather caching hook
 * ──────────────────────────────────────────────────────
 * - 15-minute TTL cache using PlatformStorage
 * - Coordinate rounding (2 decimal places) to batch nearby venues
 * - Graceful fallback on storage failure
 *
 * @module hooks/useWeather
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { PlatformStorage, MELBOURNE_COORDS } from '../utils/platform';

/** Cache TTL in milliseconds (15 minutes) */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Prefix for weather cache keys in storage */
const CACHE_PREFIX = 'weather_';

/**
 * Round a coordinate to 2 decimal places.
 * This batches nearby venues into the same cache bucket.
 * At the equator, 0.01° ≈ 1.1 km — good enough for nearby grouping.
 *
 * @param {number} coord
 * @returns {string}
 */
const roundCoord = (coord) => Number(coord).toFixed(2);

/**
 * Build the storage key for a coordinate pair.
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
const buildCacheKey = (lat, lon) =>
    `${CACHE_PREFIX}${roundCoord(lat)}_${roundCoord(lon)}`;

/**
 * Try to read cached weather from platform storage.
 * Returns null if missing, expired, or storage fails.
 *
 * @param {string} key
 * @returns {Promise<object | null>}
 */
const readCache = async (key) => {
    try {
        const raw = await PlatformStorage.getItem(key);
        if (!raw) return null;

        const cached = JSON.parse(raw);
        const age = Date.now() - (cached._cacheTimestamp || 0);

        if (age > CACHE_TTL_MS) {
            // Expired — clean up async, don't block
            PlatformStorage.removeItem(key).catch(() => { });
            return null;
        }

        return cached;
    } catch (err) {
        console.warn('[useWeatherCache] Cache read failed:', err.message);
        return null;
    }
};

/**
 * Write weather data to platform storage cache.
 *
 * @param {string} key
 * @param {object} data
 * @returns {Promise<void>}
 */
const writeCache = async (key, data) => {
    try {
        const toStore = { ...data, _cacheTimestamp: Date.now() };
        await PlatformStorage.setItem(key, JSON.stringify(toStore));
    } catch (err) {
        // Storage full or unavailable — continue without caching
        console.warn('[useWeatherCache] Cache write failed:', err.message);
    }
};

/**
 * Demo fallback weather for Melbourne.
 * Used when API key is missing or API call fails.
 */
const DEMO_WEATHER = {
    main: { temp: 22, feels_like: 21, humidity: 55 },
    weather: [{ main: 'Clear', description: 'clear sky', icon: '01d' }],
    wind: { speed: 3.5 },
    name: 'Melbourne',
    uvi: 8,
    hourly: Array.from({ length: 12 }, (_, i) => ({
        dt: Date.now() / 1000 + 3600 * i,
        temp: Math.max(16, 22 - Math.abs(i - 2) * 0.8),
        weather: [{ main: i < 5 ? 'Clear' : 'Clouds', icon: i < 5 ? '01d' : '02d' }],
        wind_speed: 3 + Math.random() * 4,
        uvi: Math.max(0, 8 - i),
    })),
};

/**
 * Fetch weather from OpenWeather API with caching.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @returns {Promise<object>} weather data
 */
export const fetchWeatherWithCache = async (
    lat = MELBOURNE_COORDS.lat,
    lon = MELBOURNE_COORDS.lon,
    apiKey = ''
) => {
    const cacheKey = buildCacheKey(lat, lon);

    // 1. Check cache first
    const cached = await readCache(cacheKey);
    if (cached) {
        console.log(`[useWeatherCache] HIT for ${cacheKey}`);
        return cached;
    }

    console.log(`[useWeatherCache] MISS for ${cacheKey} — fetching from API`);

    // 2. No valid API key → return demo data
    if (!apiKey) {
        console.log('[useWeatherCache] No API key — using demo weather');
        await writeCache(cacheKey, DEMO_WEATHER);
        return DEMO_WEATHER;
    }

    // 3. Fetch from OpenWeather
    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather`,
            {
                params: { lat, lon, appid: apiKey, units: 'metric' },
                timeout: 8000,
            }
        );

        const weatherData = response.data;

        // Try UV index (separate endpoint)
        try {
            const uvResponse = await axios.get(
                `https://api.openweathermap.org/data/2.5/uvi`,
                {
                    params: { lat, lon, appid: apiKey },
                    timeout: 5000,
                }
            );
            weatherData.uvi = uvResponse.data.value;
        } catch {
            weatherData.uvi = weatherData.weather[0]?.main === 'Clear' ? 8 : 2;
        }

        // 4. Cache the response
        await writeCache(cacheKey, weatherData);
        return weatherData;
    } catch (err) {
        console.error('[useWeatherCache] API fetch failed:', err.message);

        // 5. Try stale cache as fallback (ignore TTL)
        try {
            const raw = await PlatformStorage.getItem(cacheKey);
            if (raw) {
                console.log('[useWeatherCache] Using stale cache as fallback');
                return JSON.parse(raw);
            }
        } catch {
            // Storage totally broken
        }

        // 6. Last resort: demo data
        return DEMO_WEATHER;
    }
};

/**
 * Convenience: get cached weather without fetching.
 * Returns null if not cached or expired.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<object | null>}
 */
export const getCachedWeather = async (
    lat = MELBOURNE_COORDS.lat,
    lon = MELBOURNE_COORDS.lon
) => {
    return readCache(buildCacheKey(lat, lon));
};

/**
 * React hook wrapping the weather cache.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @returns {{ weather: object | null, loading: boolean, error: string | null, refresh: () => void }}
 */
export const useWeatherCache = (
    lat = MELBOURNE_COORDS.lat,
    lon = MELBOURNE_COORDS.lon,
    apiKey = ''
) => {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWeatherWithCache(lat, lon, apiKey);
            if (mountedRef.current) {
                setWeather(data);
                setLoading(false);
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err.message);
                setLoading(false);
            }
        }
    }, [lat, lon, apiKey]);

    useEffect(() => {
        mountedRef.current = true;
        refresh();

        // Auto-refresh every 15 minutes
        const interval = setInterval(refresh, CACHE_TTL_MS);

        return () => {
            mountedRef.current = false;
            clearInterval(interval);
        };
    }, [refresh]);

    return { weather, loading, error, refresh };
};

export default useWeatherCache;
