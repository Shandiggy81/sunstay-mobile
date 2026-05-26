import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { storage } from '../utils/platform';
import { calculateLiveSunScore } from '../utils/sunScore';
import { getMelbourneWeather } from '../utils/weatherService';

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
            'weather_code',
            'cloud_cover',
            'wind_speed_10m',
            'wind_gusts_10m',
            'uv_index',
            'is_day',
        ].join(','),
        // temperature_2m added for forward window projection; forecast_days=2 eliminates midnight data gap
        hourly: 'shortwave_radiation,precipitation_probability,cloud_cover,temperature_2m',
        daily: 'sunrise,sunset',
        timezone: 'auto',
        forecast_days: '2',
    });

    const response = await axios.get(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal });
    const current = response?.data?.current || {};

    if (current.temperature_2m == null) return null;

    const mappedCondition = getWeatherFromOpenMeteoCode(Number(current.weather_code));
    const sunset = toUnixTimestamp(response?.data?.daily?.sunset?.[0]);
    const sunrise = toUnixTimestamp(response?.data?.daily?.sunrise?.[0]);

    return {
        main: {
            temp: current.temperature_2m,
            feels_like: current.apparent_temperature ?? current.temperature_2m,
            humidity: current.relative_humidity_2m ?? null,
        },
        weather: [mappedCondition],
        wind: {
            speed: current.wind_speed_10m != null ? current.wind_speed_10m / 3.6 : 0,
        },
        clouds: { all: current.cloud_cover ?? null },
        uvi: current.uv_index ?? null,
        windGusts: current.wind_gusts_10m ?? null,
        precipProbability: response?.data?.hourly?.precipitation_probability?.[new Date().getHours()] ?? 0,
        shortwaveRadiation: response?.data?.hourly?.shortwave_radiation?.[new Date().getHours()] ?? 0,
        isDay: current.is_day ?? 1,
        cloudCoverPct: current.cloud_cover ?? 0,
        hourly: {
            shortwave_radiation:       response?.data?.hourly?.shortwave_radiation       || [],
            precipitation_probability: response?.data?.hourly?.precipitation_probability || [],
            cloud_cover:               response?.data?.hourly?.cloud_cover               || [],
            temperature_2m:            response?.data?.hourly?.temperature_2m            || [],
            // wind_gusts_10m not in hourly params — forward window uses current gusts as flat proxy
        },
        sys: {
            sunrise: sunrise ?? Math.floor(Date.now() / 1000) - 7200,
            sunset:  sunset  ?? Math.floor(Date.now() / 1000) + 10800,
        },
        name: 'Melbourne',
        source: 'open-meteo',
    };
};

const normalizeCachedWeather = (data) => {
    if (!data) return null;
    return {
        ...data,
        clouds: data.clouds || { all: null },
        sys: data.sys || { sunset: Math.floor(Date.now() / 1000) + 10800 },
    };
};

export const useWeather = () => {
    const context = useContext(WeatherContext);
    if (!context) {
        return {
            weather: null,
            loading: true,
            theme: 'sunny',
            getBackgroundGradient: () => 'from-amber-400 via-orange-400 to-yellow-500',
            calculateSunstayScore: () => 75,
            getBestWindow: () => ({ type: 'UNKNOWN', label: '⚡ Checking conditions...', score: 0, startsInHours: null }),
            getFireplaceMode: () => false,
            getTemperature: () => null,
            getWeatherDescription: () => 'Loading weather...',
            getCardBackground: () => 'from-amber-50 via-orange-50 to-yellow-50',
            getCardAccent: () => 'border-amber-300/50',
        };
    }
    return context;
};

export const WeatherProvider = ({ children }) => {
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState('sunny');
    const [overrideType, setOverrideType] = useState(null);

    const OVERRIDES = {
        perfect: {
            main: { temp: 26, feels_like: 25, humidity: 40 },
            weather: [{ main: 'Clear', description: 'perfect sunny day', icon: '01d' }],
            wind: { speed: 2.5 },
            uvi: 4,
            clouds: { all: 10 },
            sys: { sunset: Date.now() / 1000 + 14400 },
            name: 'Melbourne (Demo)',
            source: 'override',
            theme: 'sunny',
        },
        windy: {
            main: { temp: 19, feels_like: 15, humidity: 45 },
            weather: [{ main: 'Clouds', description: 'gusty winds', icon: '04d' }],
            wind: { speed: 18.5 },
            uvi: 2,
            clouds: { all: 55 },
            sys: { sunset: Date.now() / 1000 + 14400 },
            name: 'Melbourne (Demo)',
            source: 'override',
            theme: 'cloudy',
        },
        rainy: {
            main: { temp: 14, feels_like: 12, humidity: 85 },
            weather: [{ main: 'Rain', description: 'steady rainfall', icon: '10d' }],
            wind: { speed: 8 },
            uvi: 1,
            clouds: { all: 95 },
            sys: { sunset: Date.now() / 1000 + 14400 },
            name: 'Melbourne (Demo)',
            source: 'override',
            theme: 'rainy',
        },
    };

    const applyWeatherData = useCallback((data) => {
        const normalized = normalizeCachedWeather(data);
        setWeather(normalized);
        const condition = String(normalized?.weather?.[0]?.main || '').toLowerCase();
        setTheme(getThemeFromCondition(condition));
    }, []);

    const fetchWeather = useCallback(async (signal) => {
        setLoading(true);

        if (overrideType) {
            const data = OVERRIDES[overrideType];
            setWeather(data);
            setTheme(data.theme);
            setLoading(false);
            return;
        }

        try {
            const cachedString = await storage.getItem(CACHE_KEY);
            if (cachedString) {
                const { data, timestamp } = JSON.parse(cachedString);
                if (Date.now() - timestamp < CACHE_EXPIRY) {
                    applyWeatherData(data);
                    setLoading(false);
                    return;
                }
            }
        } catch {
            // cache miss
        }

        let liveWeather = null;

        if (WEATHER_API_KEY) {
            try {
                const response = await axios.get(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}&units=metric`,
                    { signal }
                );
                const weatherData = { ...response.data, source: 'openweather' };

                const OPENUV_KEY = (import.meta.env.VITE_OPENUV_API_KEY || '').trim();
                if (OPENUV_KEY) {
                    try {
                        const uvRes = await fetch(
                            `https://api.openuv.io/api/v1/uv?lat=${MELBOURNE_COORDS.lat}&lng=${MELBOURNE_COORDS.lon}`,
                            { headers: { 'x-access-token': OPENUV_KEY }, signal }
                        );
                        const uvData = await uvRes.json();
                        if (uvData?.result?.uv != null) weatherData.uvi = uvData.result.uv;
                    } catch {
                        try {
                            const uvResponse = await axios.get(
                                `https://api.openweathermap.org/data/2.5/uvi?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}`,
                                { signal }
                            );
                            weatherData.uvi = uvResponse.data.value;
                        } catch {
                            const main = String(weatherData?.weather?.[0]?.main || '').toLowerCase();
                            weatherData.uvi = main.includes('clear') ? 8 : 2;
                        }
                    }
                } else {
                    try {
                        const uvResponse = await axios.get(
                            `https://api.openweathermap.org/data/2.5/uvi?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}`,
                            { signal }
                        );
                        weatherData.uvi = uvResponse.data.value;
                    } catch {
                        const main = String(weatherData?.weather?.[0]?.main || '').toLowerCase();
                        weatherData.uvi = main.includes('clear') ? 8 : 2;
                    }
                }

                liveWeather = normalizeCachedWeather(weatherData);
            } catch (error) {
                if (isAbortError(error)) return;
                liveWeather = null;
            }
        }

        if (!liveWeather) {
            try {
                liveWeather = await fetchOpenMeteoWeather(MELBOURNE_COORDS.lat, MELBOURNE_COORDS.lon, signal);
            } catch (error) {
                if (isAbortError(error)) return;
                liveWeather = null;
            }
        }

        if (signal?.aborted) return;
        const nextWeather = liveWeather || DEMO_WEATHER;
        applyWeatherData(nextWeather);
        setLoading(false);

        if (nextWeather.source !== 'demo') {
            try {
                await storage.setItem(CACHE_KEY, JSON.stringify({ data: nextWeather, timestamp: Date.now() }));
            } catch {
                // cache write failed
            }
        }
    // WEATHER_API_KEY removed from deps — now module-level constant, never changes
    }, [overrideType, applyWeatherData]);

    useEffect(() => {
        const controller = new AbortController();
        fetchWeather(controller.signal);
        return () => controller.abort();
    }, [fetchWeather]);

    const updateOverride = (type) => setOverrideType(type === overrideType ? null : type);

    const getBackgroundGradient = () => {
        if (overrideType === 'rainy') return 'from-slate-700 via-blue-900 to-indigo-900';
        if (overrideType === 'windy') return 'from-gray-400 via-slate-500 to-gray-600';
        return 'from-amber-400 via-orange-400 to-yellow-500';
    };

    const getCozyModeMeta = () => {
        if (!weather) {
            return {
                isActive: overrideType === 'rainy',
                reason: overrideType === 'rainy' ? 'rain' : 'mild',
                headline: overrideType === 'rainy'
                    ? 'Best cozy venues right now'
                    : 'Outdoor conditions are favourable',
            };
        }
        const apparentTemp = weather.main?.feels_like ?? weather.main?.temp ?? 20;
        const rainProb = weather.precipProbability ?? 0;
        const gustKmh = weather.windGusts ?? (weather.wind?.speed ?? 0) * 3.6;
        const condition = String(weather.weather?.[0]?.main || '').toLowerCase();
        const isWet = condition.includes('rain') || rainProb >= 45;
        const isCold = apparentTemp <= 16;
        const isWindy = gustKmh >= 35;
        const isActive = isWet || isCold || isWindy || overrideType === 'rainy';
        const reason = isWet ? 'rain' : isCold ? 'cold' : isWindy ? 'wind' : 'mild';
        const headline = isWet
            ? 'Best cozy venues right now'
            : isCold
                ? 'Warm sheltered venues feel better now'
                : isWindy
                    ? 'Sheltered spots are trending now'
                    : 'Outdoor conditions are favourable';
        return {
            isActive, reason, headline,
            apparentTemp: Math.round(apparentTemp),
            rainProb,
            gustKmh: Math.round(gustKmh),
        };
    };

    const calculateSunstayScore = (venue) => {
        if (!weather) return 75;
        const liveWeatherInput = {
            shortwaveRadiation: weather.shortwaveRadiation ?? 0,
            apparentTemp: weather.main?.feels_like ?? weather.main?.temp ?? 20,
            precipProbability: weather.precipProbability ?? 0,
            cloudCover: weather.cloudCoverPct ?? weather.clouds?.all ?? 0,
            windGusts: weather.windGusts ?? (weather.wind?.speed ?? 0) * 3.6,
            isDay: weather.isDay ?? 1,
            uvIndex: weather.uvi ?? null,
        };
        const { score } = calculateLiveSunScore(liveWeatherInput);
        const cozyMode = getCozyModeMeta();
        const tags = venue?.tags || [];
        const hasHeat =
            tags.includes('Fireplace') ||
            tags.includes('Heaters') ||
            venue?.heating ||
            venue?.fireplace;
        const outdoorOnly =
            tags.includes('Beer Garden') ||
            tags.includes('Rooftop') ||
            tags.includes('Waterfront') ||
            tags.includes('Outdoor Seating');
        const cozyBonus = cozyMode.isActive && hasHeat ? 22 : 0;
        const outdoorPenalty = cozyMode.isActive && outdoorOnly && !hasHeat ? 8 : 0;
        return Math.max(0, Math.min(100, score + cozyBonus - outdoorPenalty));
    };

    // ─── Forward Window Projection ────────────────────────────────────────────
    // Scans the next `hoursAhead` hourly slots using the real calculateLiveSunScore
    // engine. Uses a 2-hour rolling average block so short spikes don't mislead.
    // Wind gusts are not in the hourly array — current gusts used as a flat proxy
    // (conservative: avoids falsely inflating future scores on gusty days).
    // Only promotes a future window when it beats current score by > 15 points
    // (not %) to avoid noisy micro-improvements cluttering the card copy.
    const getBestWindow = (hoursAhead = 8) => {
        const hourly = weather?.hourly;

        // Guard: no hourly data (OpenWeather path, demo mode, or cache from before this deploy)
        if (!hourly || !hourly.shortwave_radiation?.length) {
            return { type: 'UNKNOWN', label: '⚡ Checking conditions...', score: 0, startsInHours: null };
        }

        // Current hour index — for 2-day arrays this is always 0-23 (today)
        const currentHour = new Date().getHours();
        const currentGusts = weather.windGusts ?? (weather.wind?.speed ?? 0) * 3.6;
        const totalSlots = hourly.shortwave_radiation.length; // 48 for 2-day forecast

        // Build a weather input object for a given hourly index, matching calculateLiveSunScore's signature
        const inputForIndex = (i) => ({
            shortwaveRadiation:  hourly.shortwave_radiation?.[i]       ?? 0,
            apparentTemp:        hourly.temperature_2m?.[i]            ?? 20,
            precipProbability:   hourly.precipitation_probability?.[i] ?? 0,
            cloudCover:          hourly.cloud_cover?.[i]               ?? 0,
            windGusts:           currentGusts,    // flat proxy — see comment above
            isDay:               (i % 24) >= 6 && (i % 24) <= 21 ? 1 : 0,  // simple day guard
            uvIndex:             null,             // not in hourly params; engine defaults gracefully
        });

        // Current baseline score (0-100 scale, same as calculateSunstayScore)
        const currentScore = calculateLiveSunScore(inputForIndex(currentHour)).score;

        let bestScore = currentScore;
        let bestOffset = 0;

        for (let offset = 1; offset <= hoursAhead; offset++) {
            const slotIndex = currentHour + offset;
            if (slotIndex >= totalSlots) break;

            // 2-hour rolling block average (smooths single-hour spikes)
            const nextIndex = slotIndex + 1 < totalSlots ? slotIndex + 1 : slotIndex;
            const blockScore = (
                calculateLiveSunScore(inputForIndex(slotIndex)).score +
                calculateLiveSunScore(inputForIndex(nextIndex)).score
            ) / 2;

            // Only promote if materially better (15-point threshold, not percentage)
            if (blockScore > bestScore && (blockScore - currentScore) > 15) {
                bestScore = blockScore;
                bestOffset = offset;
            }
        }

        const pct = Math.round(bestScore);

        if (bestOffset === 0) {
            return {
                type: 'CURRENT_PEAK',
                label: `✨ Peak Comfort Right Now (Score: ${pct}%)`,
                score: bestScore,
                startsInHours: 0,
            };
        }

        return {
            type: 'FUTURE_WINDOW',
            label: `☀️ Golden Window: Starts in ${bestOffset}h (Score: ${pct}%)`,
            score: bestScore,
            startsInHours: bestOffset,
        };
    };
    // ─────────────────────────────────────────────────────────────────────────

    const getFireplaceMode = () => getCozyModeMeta().isActive;
    const getTemperature = () => (weather ? Math.round(weather.main?.temp ?? 0) : null);
    const getUVIndex = () => weather?.uvi ?? 0;

    const getWeatherDescription = () => {
        if (!weather) return 'Loading...';
        const desc = weather.weather?.[0]?.description || '';
        const temp = Math.round(weather.main?.temp || 0);
        const cleanDesc = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : 'Conditions unavailable';
        return `${temp}\u00B0 \u2022 ${cleanDesc}`;
    };

    const getCardBackground = () => {
        if (overrideType === 'rainy') return 'from-slate-100 via-blue-50 to-indigo-50';
        if (overrideType === 'windy') return 'from-gray-50 via-slate-100 to-gray-100';
        return 'from-amber-50 via-orange-50 to-yellow-50';
    };

    const getCardAccent = () => {
        if (overrideType === 'rainy') return 'border-blue-300/50';
        if (overrideType === 'windy') return 'border-slate-300/50';
        return 'border-amber-300/50';
    };

    const value = {
        weather, loading, theme,
        cozyMode: getCozyModeMeta(),
        overrideType,
        updateOverride,
        getBackgroundGradient,
        calculateSunstayScore,
        getBestWindow,
        getFireplaceMode,
        getTemperature,
        getWeatherDescription,
        getCardBackground,
        getCardAccent,
        getUVIndex,
        liveSunScore: weather ? calculateLiveSunScore({
            shortwaveRadiation: weather.shortwaveRadiation ?? 0,
            apparentTemp: weather.main?.feels_like ?? weather.main?.temp ?? 20,
            precipProbability: weather.precipProbability ?? 0,
            cloudCover: weather.cloudCoverPct ?? weather.clouds?.all ?? 0,
            windGusts: weather.windGusts ?? (weather.wind?.speed ?? 0) * 3.6,
            isDay: weather.isDay ?? 1,
            uvIndex: weather.uvi ?? null,
        }) : { score: 75, label: 'Great Conditions \uD83C\uDF24\uFE0F', color: '#34D399' },
    };

    return (
        <WeatherContext.Provider value={value}>
            {children}
        </WeatherContext.Provider>
    );
};
