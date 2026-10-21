import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchOpenMeteoWeatherWithMeta } from '../utils/weatherService';
import { scoreVenueFromWeather, sunScoreFromWeather } from '../utils/scoreFromOpenMeteo';
import { computeBestWindow } from '../utils/getBestWindow';
import { melbourneDate } from '../utils/sunPosition';
import { weatherRetryDecision } from '../utils/weatherRecovery';

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
    // Provenance for DataBadge: kind 'live' | 'demo' (null while loading); fetchedAt in epoch ms.
    const [dataMeta, setDataMeta] = useState({ kind: null, fetchedAt: null });
    const [overrideType, setOverrideType] = useState(null);
    // Settled TOD slider minutes (Melbourne wall-clock). null = live “now”.
    const [previewMinutes, setPreviewMinutes] = useState(null);

    // Retry bookkeeping lives in a ref so retries never re-render on their own.
    const recovery = useRef({ live: false, inFlight: false, timedRetryUsed: false, lastAttemptAt: null });

    /**
     * One Open-Meteo attempt. A quiet attempt is a background retry: it keeps
     * the fallback on screen (no loading flash) and only changes state on success.
     * Resolves true when live weather loaded.
     */
    const fetchWeather = useCallback(async (signal, { quiet = false } = {}) => {
        const r = recovery.current;
        r.inFlight = true;
        r.lastAttemptAt = Date.now();
        if (!quiet) {
            setLoading(true);
            setError(null);
        }

        try {
            // Geo+TTL cache lives in weatherService (30 min, 2dp). Warm hits skip the network.
            const { data, kind, fetchedAt } = await fetchOpenMeteoWeatherWithMeta(
                MELBOURNE_COORDS.lat,
                MELBOURNE_COORDS.lon,
                signal
            );
            r.live = true;
            setWeather(data);
            setDataMeta({ kind, fetchedAt });
            setError(null);
            return true;
        } catch (err) {
            if (isAbortError(err)) return false;
            if (quiet) {
                console.warn('[WeatherProvider] Open-Meteo retry failed:', err.message);
                return false;
            }
            console.warn('[WeatherProvider] Open-Meteo fetch failed, falling back to demo data:', err.message);
            setWeather(DEMO_WEATHER);
            setDataMeta({ kind: 'demo', fetchedAt: null });
            setError(err.message || 'Weather temporarily unavailable');
            return false;
        } finally {
            r.inFlight = false;
            if (!quiet) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const r = recovery.current;
        let timer = null;

        const decide = (trigger) => weatherRetryDecision({ ...r, now: Date.now(), trigger });

        const attempt = async (quiet) => {
            const ok = await fetchWeather(controller.signal, { quiet });
            if (ok || controller.signal.aborted) return;
            // One timed retry per page load; after that only online/visible can retry.
            const decision = decide('failed');
            if (decision.retry) {
                r.timedRetryUsed = true;
                timer = setTimeout(() => { timer = null; attempt(true); }, decision.delayMs);
            }
        };

        const retryOn = (trigger) => {
            if (trigger === 'visible' && document.visibilityState !== 'visible') return;
            if (!decide(trigger).retry) return;
            clearTimeout(timer);
            timer = null;
            attempt(true);
        };
        const onOnline = () => retryOn('online');
        const onVisible = () => retryOn('visible');

        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisible);
        attempt(false);

        return () => {
            controller.abort();
            clearTimeout(timer);
            window.removeEventListener('online', onOnline);
            document.removeEventListener('visibilitychange', onVisible);
        };
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

    const getUVIndex = useCallback(() => {
        return weather?.uvi ?? 0;
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

    // Direct sun on the seats (sun height × cloud × exposure), for the
    // "Sun score" fallback when a venue has no microclimate profile.
    // calculateSunstayScore above is the comfort index, not a sun score.
    const getSunScoreResult = useCallback((venue) => {
        if (!weather || weatherUnavailable) {
            return { score: null, label: 'Score unavailable', unavailable: true };
        }
        if (previewMinutes == null) {
            return sunScoreFromWeather(weather, venue);
        }
        return sunScoreFromWeather(weather, venue, { at: melbourneDate(previewMinutes) });
    }, [weather, previewMinutes, weatherUnavailable]);

    const calculateSunScore = useCallback((venue) => {
        return getSunScoreResult(venue).score;
    }, [getSunScoreResult]);

    const value = {
        weather,
        loading,
        error,
        unavailable: weatherUnavailable,
        dataKind: dataMeta.kind,
        fetchedAt: dataMeta.fetchedAt,
        overrideType,
        setOverrideType,
        refetch: fetchWeather,
        getWeatherSummary,
        getUVIndex,
        getCozyModeMeta,
        getWeatherSeverity,
        getBestWindow,
        calculateSunstayScore,
        getSunstayScoreResult,
        calculateSunScore,
        getSunScoreResult,
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
