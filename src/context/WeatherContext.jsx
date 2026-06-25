import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { storage } from '../utils/platform';
import { calculateLiveSunScore } from '../utils/sunScore';

const WeatherContext = createContext(null);

const MELBOURNE_COORDS = { lat: -37.8136, lon: 144.9631 };
const CACHE_EXPIRY = 900000;
const CACHE_KEY = `sunstay_weather_${MELBOURNE_COORDS.lat.toFixed(2)}_${MELBOURNE_COORDS.lon.toFixed(2)}`;
const isAbortError = (error) => error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';

// Resolved once at module level — stable reference, never causes useCallback/useEffect churn
const WEATHER_API_KEY = (import.meta.env.VITE_OPENWEATHER_KEY || '').trim();

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

const getThemeFromCondition = (condition) => {
    if (condition.includes('rain') || condition.includes('drizzle')) return 'rainy';
    if (condition.includes('cloud') || condition.includes('fog')) return 'cloudy';
    if (condition.includes('wind') || condition.includes('gale')) return 'windy';
    return 'sunny';
};

const toUnixTimestamp = (isoDateTime) => {
    if (!isoDateTime) return null;
    const ms = Date.parse(isoDateTime);
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
};

const getWeatherFromOpenMeteoCode = (code) => {
    if (code === 0) return { main: 'Clear', description: 'clear sky', icon: '01d' };
    if ([1].includes(code)) return { main: 'Clouds', description: 'mostly clear', icon: '02d' };
    if ([2].includes(code)) return { main: 'Clouds', description: 'partly cloudy', icon: '03d' };
    if ([3].includes(code)) return { main: 'Clouds', description: 'overcast', icon: '04d' };
    if ([45, 48].includes(code)) return { main: 'Fog', description: 'foggy', icon: '50d' };
    if ([51, 53, 55, 56, 57].includes(code)) return { main: 'Drizzle', description: 'drizzle', icon: '09d' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { main: 'Rain', description: 'rain showers', icon: '10d' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { main: 'Snow', description: 'snow', icon: '13d' };
    if ([95, 96, 99].includes(code)) return { main: 'Thunderstorm', description: 'thunderstorm', icon: '11d' };
    return { main: 'Clouds', description: 'variable cloud', icon: '03d' };
};

const fetchOpenMeteoWeather = async (lat, lon, signal) => {
    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'precipitation',
            'weather_code',
            'wind_speed_10m',
            'wind_gusts_10m',
            'cloud_cover',
            'uv_index',
            'is_day',
            'shortwave_radiation',
            'surface_pressure',
        ].join(','),
        hourly: [
            'temperature_2m',
            'apparent_temperature',
            'precipitation_probability',
            'weather_code',
            'cloud_cover',
            'wind_speed_10m',
            'wind_gusts_10m',
            'shortwave_radiation',
            'uv_index',
            'is_day',
        ].join(','),
        daily: [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'sunrise',
            'sunset',
            'uv_index_max',
            'precipitation_sum',
            'wind_speed_10m_max',
        ].join(','),
        timezone: 'Australia/Melbourne',
        forecast_days: '2',
        wind_speed_unit: 'kmh',
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const data = await response.json();

    const current = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    const wmoCode = current.weather_code ?? 0;
    const weatherDesc = getWeatherFromOpenMeteoCode(wmoCode);

    // Derive sunrise/sunset unix from daily ISO strings
    const sunriseUnix = toUnixTimestamp(daily.sunrise?.[0]);
    const sunsetUnix = toUnixTimestamp(daily.sunset?.[0]);

    return {
        main: {
            temp: current.temperature_2m ?? 20,
            feels_like: current.apparent_temperature ?? 20,
            humidity: current.relative_humidity_2m ?? 50,
        },
        weather: [weatherDesc],
        wind: { speed: (current.wind_speed_10m ?? 0) / 3.6 }, // convert kmh → m/s
        clouds: { all: current.cloud_cover ?? 0 },
        uvi: current.uv_index ?? 0,
        sys: {
            sunrise: sunriseUnix,
            sunset: sunsetUnix,
        },
        name: 'Melbourne',
        source: 'open-meteo',
        theme: getThemeFromCondition(weatherDesc.description),
        isDay: current.is_day === 1,
        shortwaveRadiation: current.shortwave_radiation ?? 0,
        windGusts: current.wind_gusts_10m ?? 0,
        hourly: {
            ...hourly,
            _tzOffsetSeconds: 36000, // AEST = UTC+10
        },
        daily,
    };
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

            // 2. Fetch from Open-Meteo (primary source — no key required)
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

            // 3. Fall back to OpenWeather if key available
            if (WEATHER_API_KEY) {
                try {
                    const owUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&units=metric&appid=${WEATHER_API_KEY}`;
                    const resp = await axios.get(owUrl, { signal });
                    const owData = {
                        ...resp.data,
                        source: 'openweather',
                        theme: getThemeFromCondition(resp.data.weather?.[0]?.description ?? ''),
                    };
                    await setCachedWeather(owData);
                    setWeather(owData);
                } catch (owErr) {
                    if (isAbortError(owErr)) return;
                    console.warn('[WeatherProvider] OpenWeather fallback also failed:', owErr.message);
                    setWeather(DEMO_WEATHER);
                }
            } else {
                setWeather(DEMO_WEATHER);
            }

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
