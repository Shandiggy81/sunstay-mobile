import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { storage } from '../utils/platform';
import { calculateLiveSunScore } from '../util/sunScore';
import { getMelbourneWeather } from '../util/weatherService';

const WeatherContext = createContext(null);

const MELBOURNE_COORDS = { lat: -37.8136, lon: 144.9631 };
const CACHE_EXPIRY = 900000;
const CACHE_KEY = `sunstay_weather_${MELBOURNE_COORDS.lat.toFixed(2)}_${MELBOURNE_COORDS.lon.toFixed(2)}`;

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

const fetchOpenMeteoWeather = async (lat, lon) => {
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
        hourly: 'shortwave_radiation,precipitation_probability,cloud_cover',
        daily: 'sunrise,sunset',
        timezone: 'auto',
        forecast_days: '1',
    });

    const response = await axios.get(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
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
            shortwave_radiation:      response?.data?.hourly?.shortwave_radiation      || [],
            precipitation_probability: response?.data?.hourly?.precipitation_probability || [],
            cloud_cover:              response?.data?.hourly?.cloud_cover               || [],
        },
        sys: {
            sunrise: sunrise ?? Math.floor(Date.now() / 1000) - 7200,
            sunset: sunset ?? Math.floor(Date.now() / 1000) + 10800,
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

    const WEATHER_API_KEY = (import.meta.env.VITE_OPENWEATHER_KEY || '').trim();

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

    const fetchWeather = useCallback(async () => {
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
                    `https://api.openweathermap.org/data/2.5/weather?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}&units=metric`
                );
                const weatherData = { ...response.data, source: 'openweather' };

                try {
                    const uvResponse = await axios.get(
                        `https://api.openweathermap.org/data/2.5/uvi?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}`
                    );
                    weatherData.uvi = uvResponse.data.value;
                } catch {
                    const main = String(weatherData?.weather?.[0]?.main || '').toLowerCase();
                    weatherData.uvi = main.includes('clear') ? 8 : 2;
                }

                liveWeather = normalizeCachedWeather(weatherData);
            } catch {
                liveWeather = null;
            }
        }

        // Keep the demo live even without paid API keys.
        if (!liveWeather) {
            try {
                liveWeather = await fetchOpenMeteoWeather(MELBOURNE_COORDS.lat, MELBOURNE_COORDS.lon);
            } catch {
                liveWeather = null;
            }
        }

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
    }, [WEATHER_API_KEY, overrideType, applyWeatherData]);

    useEffect(() => {
        fetchWeather();
    }, [fetchWeather]);

    const updateOverride = (type) => setOverrideType(type === overrideType ? null : type);

    const getBackgroundGradient = () => {
        if (overrideType === 'rainy') return 'from-slate-700 via-blue-900 to-indigo-900';
        if (overrideType === 'windy') return 'from-gray-400 via-slate-500 to-gray-600';
        return 'from-amber-400 via-orange-400 to-yellow-500';
    };

    const calculateSunstayScore = (venue) => {
        if (!weather) return 75;
        // Build a weather object compatible with calculateLiveSunScore
        const liveWeatherInput = {
            shortwaveRadiation: weather.shortwaveRadiation ?? 0,
            apparentTemp: weather.main?.feels_like ?? weather.main?.temp ?? 20,
            precipProbability: weather.precipProbability ?? 0,
            cloudCover: weather.cloudCoverPct ?? weather.clouds?.all ?? 0,
            windGusts: weather.windGusts ?? (weather.wind?.speed ?? 0) * 3.6,
            isDay: weather.isDay ?? 1,
        };
        const { score } = calculateLiveSunScore(liveWeatherInput);
        // Venue-specific bonus: fireplace/heater venues score higher in cold/wet
        const isCozy = liveWeatherInput.apparentTemp < 14 || liveWeatherInput.precipProbability > 60;
        const hasHeat = venue?.tags?.includes('Fireplace') || venue?.heating || venue?.fireplace;
        const cozyBonus = isCozy && hasHeat ? 15 : 0;
        return Math.min(100, score + cozyBonus);
    };

    const getFireplaceMode = () => theme === 'rainy' || overrideType === 'rainy';
    const getTemperature = () => (weather ? Math.round(weather.main?.temp ?? 0) : null);
    const getUVIndex = () => weather?.uvi ?? 0;

    const getWeatherDescription = () => {
        if (!weather) return 'Loading...';
        const desc = weather.weather?.[0]?.description || '';
        const temp = Math.round(weather.main?.temp || 0);
        const cleanDesc = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : 'Conditions unavailable';
        return `${temp}° • ${cleanDesc}`;
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
        weather,
        loading,
        theme,
        overrideType,
        updateOverride,
        getBackgroundGradient,
        calculateSunstayScore,
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
        }) : { score: 75, label: 'Great Conditions 🌤️', color: '#34D399' },
    };

    return (
        <WeatherContext.Provider value={value}>
            {children}
        </WeatherContext.Provider>
    );
};
