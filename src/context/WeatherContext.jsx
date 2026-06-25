import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storage } from '../utils/platform';
import { calculateLiveSunScore } from '../utils/sunScore';
import { fetchOpenMeteoWeather } from '../utils/weatherService';

const WeatherContext = createContext(null);

const MELBOURNE_COORDS = { lat: -37.8136, lon: 144.9631 };
const CACHE_EXPIRY = 900000;
const CACHE_KEY = `sunstay_weather_${MELBOURNE_COORDS.lat.toFixed(2)}_${MELBOURNE_COORDS.lon.toFixed(2)}`;
const isAbortError = (error) => error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';

const DEMO_WEATHER = {
    main: { temp: 22, feels_like: 21, humidity: 55 },
    weather: [{ main: 'Clear', description: 'sunny day', icon: '01d' }],
    wind: { speed: 3.5 },
    clouds: { all: 15 },
    uvi: 5,
    sys: { sunset: Date.now() / 1000 + 14400 },
    name: 'Melbourne (Demo)',
    source: 'demo',
    theme: 'sunny',
};

export const useWeather = () => {
    const ctx = useContext(WeatherContext);
    if (!ctx) throw new Error('useWeather must be used inside <WeatherProvider>');
    return ctx;
};

const getCachedWeather = async () => {
    try {
        const raw = await storage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > CACHE_EXPIRY) return null;
        return data;
    } catch {
        return null;
    }
};

const setCachedWeather = async (data) => {
    try {
        await storage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
        // Storage write failure is non-fatal
    }
};

export const WeatherProvider = ({ children }) => {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [overrideType, setOverrideType] = useState(null);

    const fetchWeather = useCallback(async (signal) => {
        setLoading(true);
        setError(null);

        try {
            // 1. Try cache first
            const cached = await getCachedWeather();
            if (cached) {
                setWeather(cached);
                setLoading(false);
                return;
            }

            // 2. Fetch from Open-Meteo (primary source)
            const data = await fetchOpenMeteoWeather(
                MELBOURNE_COORDS.lat,
                MELBOURNE_COORDS.lon,
                signal
            );
            await setCachedWeather(data);
            setWeather(data);
        } catch (err) {
            if (isAbortError(err)) return;

            console.warn('[WeatherProvider] Open-Meteo fetch failed, falling back to demo data:', err.message);
            setWeather(DEMO_WEATHER);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchWeather(controller.signal);
        return () => controller.abort();
    }, [fetchWeather]);

    const getWeatherSummary = useCallback(() => {
        if (!weather) return null;
        const condition = weather.weather?.[0]?.main ?? 'Unknown';
        const temp = Math.round(weather.main?.temp ?? 0);
        const feelsLike = Math.round(weather.main?.feels_like ?? 0);
        const humidity = weather.main?.humidity ?? 0;
        const windSpeed = Math.round((weather.wind?.speed ?? 0) * 3.6);
        const uvi = weather.uvi ?? 0;
        return { condition, temp, feelsLike, humidity, windSpeed, uvi, theme: weather.theme ?? 'sunny' };
    }, [weather]);

    const getCozyModeMeta = useCallback(() => {
        if (!weather) return { isActive: false, reason: null, label: null };
        const condition = weather.weather?.[0]?.main ?? '';
        const temp = weather.main?.temp ?? 20;
        const windSpeed = (weather.wind?.speed ?? 0) * 3.6;
        const isRainy = condition.includes('Rain') || condition.includes('Drizzle');
        const isCold = temp < 14;
        const isWindy = windSpeed > 35;
        const isActive = isRainy || isCold || isWindy;
        const reason = isRainy ? 'rainy' : isCold ? 'cold' : isWindy ? 'windy' : null;
        const label = isRainy ? '🌧 Rainy Day' : isCold ? '🥶 Cold Outside' : isWindy ? '💨 Windy' : null;
        return { isActive, reason, label };
    }, [weather]);

    const getWeatherSeverity = useCallback(() => {
        if (!weather) return 'unknown';
        const windSpeed = (weather.wind?.speed ?? 0) * 3.6;
        const condition = weather.weather?.[0]?.main ?? '';
        if (condition.includes('Thunderstorm') || windSpeed > 70) return 'stormy';
        if (condition.includes('Rain') || windSpeed > 40) return 'severe';
        if (condition.includes('Drizzle') || windSpeed > 25) return 'moderate';
        return 'mild';
    }, [weather]);

    const getBestWindow = useCallback((hoursAhead = 8) => {
        const hourly = weather?.hourly;
        if (!hourly || !hourly.shortwave_radiation?.length) {
            return { type: 'UNKNOWN', label: '⚡ Checking conditions...', score: 0, startsInHours: null };
        }

        const tzOffsetSeconds = hourly._tzOffsetSeconds ?? 36000;
        const nowUnix = Math.floor(Date.now() / 1000);
        const currentHour = Math.floor((nowUnix + tzOffsetSeconds) / 3600) % 24;

        const inputForIndex = (i) => {
            const safeIndex = Math.min(Math.max(i, 0), hourly.shortwave_radiation.length - 1);
            const hourOfDay = safeIndex % 24;
            return {
                shortwaveRadiation: hourly.shortwave_radiation?.[safeIndex] ?? 0,
                apparentTemp: hourly.temperature_2m?.[safeIndex] ?? 20,
                precipProbability: hourly.precipitation_probability?.[safeIndex] ?? 0,
                cloudCover: hourly.cloud_cover?.[safeIndex] ?? 0,
                windGusts: weather.windGusts ?? (weather.wind?.speed ?? 0) * 3.6,
                isDay: hourOfDay >= 6 && hourOfDay <= 20 ? 1 : 0,
                uvIndex: hourly.uv_index?.[safeIndex] ?? null,
            };
        };

        const currentScore = calculateLiveSunScore(inputForIndex(currentHour)).score;
        let bestScore = currentScore;
        let bestOffset = 0;

        for (let offset = 1; offset <= hoursAhead; offset++) {
            const slotIndex = Math.min(currentHour + offset, hourly.shortwave_radiation.length - 1);
            const scores = [slotIndex, slotIndex + 1, slotIndex + 2]
                .filter(idx => idx < hourly.shortwave_radiation.length)
                .map(idx => calculateLiveSunScore(inputForIndex(idx)).score);
            const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            if (avgScore > bestScore) {
                bestScore = avgScore;
                bestOffset = offset;
            }
        }

        if (bestScore >= 75) return { type: 'GREAT', label: '☀️ Great conditions', score: bestScore, startsInHours: bestOffset };
        if (bestScore >= 50) return { type: 'GOOD', label: '🌤 Good conditions', score: bestScore, startsInHours: bestOffset };
        if (bestScore >= 30) return { type: 'FAIR', label: '⛅ Fair conditions', score: bestScore, startsInHours: bestOffset };
        return { type: 'POOR', label: '🌧 Poor conditions', score: bestScore, startsInHours: bestOffset };
    }, [weather]);

    const calculateSunstayScore = useCallback((venue) => {
        if (!weather) return 75;
        const { isActive: cozyActive } = getCozyModeMeta();
        if (cozyActive && venue.tags?.some(t => ['Fireplace', 'Indoor Warmth', 'Cozy', 'Covered'].includes(t))) {
            return 90;
        }
        const baseScore = venue.sunshineScore ?? 50;
        const severity = getWeatherSeverity();
        const penaltyMap = { mild: 0, moderate: -10, severe: -20, stormy: -35, unknown: 0 };
        return Math.max(0, Math.min(100, baseScore + (penaltyMap[severity] ?? 0)));
    }, [weather, getCozyModeMeta, getWeatherSeverity]);

    const value = {
        weather,
        loading,
        error,
        overrideType,
        setOverrideType,
        refetch: fetchWeather,
        getWeatherSummary,
        getCozyModeMeta,
        getWeatherSeverity,
        getBestWindow,
        calculateSunstayScore,
    };

    return (
        <WeatherContext.Provider value={value}>
            {children}
        </WeatherContext.Provider>
    );
};

export default WeatherContext;
