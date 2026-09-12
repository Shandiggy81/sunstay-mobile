import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchOpenMeteoWeather } from '../utils/weatherService';
import { scoreVenueFromWeather } from '../utils/scoreFromOpenMeteo';
import { computeBestWindow } from '../utils/getBestWindow';
import { melbourneDate } from '../utils/sunPosition';

const WeatherContext = createContext(null);

const MELBOURNE_COORDS = { lat: -37.8136, lon: 144.9631 };
const isTimeoutError = (error) => error?.name === 'TimeoutError';
const isAbortError = (error) =>
    !isTimeoutError(error) && (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED');

const DEMO_WEATHER = {
    main: { temp: 22, feels_like: 21, humidity: 55 },
    weather: [{ main: 'Clear', description: 'sunny day', icon: '01d' }],
    wind: { speed: 3.5 },
    clouds: { all: 15 },
    uvi: 5,
    sys: { sunset: Date.now() / 1000 + 14400 },
    name: 'Melbourne (Demo)',
    source: 'demo',
    unavailable: true,
    theme: 'sunny',
    isDay: true,
    shortwaveRadiation: 620,
    windGusts: 12,
    windKmh: 12.6,
    precipitation: 0,
    precipProbability: 8,
    cloudCoverPct: 15,
    apparentTemp: 21,
};

export const useWeather = () => {
    const ctx = useContext(WeatherContext);
    if (!ctx) throw new Error('useWeather must be used inside <WeatherProvider>');
    return ctx;
};

export const WeatherProvider = ({ children }) => {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [overrideType, setOverrideType] = useState(null);
    // Settled TOD slider minutes (Melbourne wall-clock). null = live “now”.
    const [previewMinutes, setPreviewMinutes] = useState(null);

    const fetchWeather = useCallback(async (signal) => {
        setLoading(true);
        setError(null);

        try {
            // Geo+TTL cache lives in weatherService (30 min, 2dp). Warm hits skip the network.
            const data = await fetchOpenMeteoWeather(
                MELBOURNE_COORDS.lat,
                MELBOURNE_COORDS.lon,
                signal
            );
            setWeather(data);
        } catch (err) {
            if (isAbortError(err)) return;

            console.warn('[WeatherProvider] Open-Meteo fetch failed, falling back to demo data:', err.message);
            setWeather(DEMO_WEATHER);
            setError(err.message || 'Weather temporarily unavailable');
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
        const precipProbability = weather.precipProbability ?? 0;
        return { condition, temp, feelsLike, humidity, windSpeed, uvi, precipProbability, theme: weather.theme ?? 'sunny' };
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

    const getBestWindow = useCallback((hoursAhead = 8, venue) => {
        return computeBestWindow(weather, { hoursAhead, venue });
    }, [weather]);

    const setScorePreviewMinutes = useCallback((minutes) => {
        setPreviewMinutes((prev) => {
            if (minutes == null || minutes === '') return null;
            const n = Number(minutes);
            if (!Number.isFinite(n)) return prev;
            return n === prev ? prev : n;
        });
    }, []);

    const weatherUnavailable = Boolean(
        error || weather?.unavailable || weather?.source === 'demo'
    );

    const getSunstayScoreResult = useCallback((venue) => {
        if (!weather || weatherUnavailable) {
            return { score: null, label: 'Score unavailable', unavailable: true };
        }
        if (previewMinutes == null) {
            return scoreVenueFromWeather(weather, venue);
        }
        return scoreVenueFromWeather(weather, venue, { at: melbourneDate(previewMinutes) });
    }, [weather, previewMinutes, weatherUnavailable]);

    const calculateSunstayScore = useCallback((venue) => {
        return getSunstayScoreResult(venue).score;
    }, [getSunstayScoreResult]);

    const value = {
        weather,
        loading,
        error,
        unavailable: weatherUnavailable,
        overrideType,
        setOverrideType,
        refetch: fetchWeather,
        getWeatherSummary,
        getCozyModeMeta,
        getWeatherSeverity,
        getBestWindow,
        calculateSunstayScore,
        getSunstayScoreResult,
        previewMinutes,
        setScorePreviewMinutes,
    };

    return (
        <WeatherContext.Provider value={value}>
            {children}
        </WeatherContext.Provider>
    );
};

export default WeatherContext;
