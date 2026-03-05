import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { storage } from '../utils/platform';

const WeatherContext = createContext(null);

export const useWeather = () => {
    const context = useContext(WeatherContext);
    if (!context) {
        // Return default values instead of throwing to prevent crashes
        return {
            weather: null,
            loading: true,
            theme: 'sunny',
            getBackgroundGradient: () => 'from-amber-400 via-orange-400 to-yellow-500',
            calculateSunstayScore: () => 75,
            getFireplaceMode: () => false,
            getTemperature: () => null,
            getWeatherDescription: () => 'Check back for live weather insights!',
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
    const [overrideType, setOverrideType] = useState(null); // 'perfect', 'windy', 'rainy'

    const WEATHER_API_KEY = '8448b7dad269322556c216d02ca97647';
    const MELBOURNE_COORDS = { lat: -37.8136, lon: 144.9631 };
    const CACHE_KEY = `sunstay_weather_${MELBOURNE_COORDS.lat.toFixed(2)}_${MELBOURNE_COORDS.lon.toFixed(2)}`;
    const CACHE_EXPIRY = 900000; // 15 minutes

    const OVERRIDES = {
        perfect: {
            main: { temp: 26, feels_like: 25, humidity: 40 },
            weather: [{ main: 'Clear', description: 'perfect sunny day', icon: '01d' }],
            wind: { speed: 2.5 },
            uvi: 4,
            theme: 'sunny'
        },
        windy: {
            main: { temp: 19, feels_like: 15, humidity: 45 },
            weather: [{ main: 'Clouds', description: 'gusty winds', icon: '04d' }],
            wind: { speed: 18.5 },
            uvi: 2,
            theme: 'cloudy'
        },
        rainy: {
            main: { temp: 14, feels_like: 12, humidity: 85 },
            weather: [{ main: 'Rain', description: 'steady rainfall', icon: '10d' }],
            wind: { speed: 8 },
            uvi: 1,
            theme: 'rainy'
        }
    };

    const fetchWeather = async () => {
        if (overrideType) {
            const data = { ...OVERRIDES[overrideType], name: 'Melbourne (Demo)', sys: { sunset: Date.now() / 1000 + 14400 } };
            setWeather(data);
            setTheme(data.theme);
            setLoading(false);
            return;
        }

        // Check cache first (cross-platform via PlatformStorage)
        try {
            const cachedString = await storage.getItem(CACHE_KEY);
            if (cachedString) {
                const { data, timestamp } = JSON.parse(cachedString);
                if (Date.now() - timestamp < CACHE_EXPIRY) {
                    console.log('[WeatherContext] Cache HIT');
                    setWeather(data);
                    const condition = data.weather[0].main.toLowerCase();
                    setTheme(getThemeFromCondition(condition));
                    setLoading(false);
                    return;
                }
            }
        } catch (cacheErr) {
            console.warn('[WeatherContext] Cache read failed:', cacheErr);
        }

        // Skip API call if no valid key is set
        if (!WEATHER_API_KEY) {
            console.log('Weather API key not configured, using demo weather data');
            setWeather(DEMO_WEATHER);
            setTheme('sunny');
            setLoading(false);
            return;
        }

        try {
            const response = await axios.get(
                `https://api.openweathermap.org/data/2.5/weather?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}&units=metric`
            );
            const weatherData = response.data;

            // Try UV
            try {
                const uvResponse = await axios.get(
                    `https://api.openweathermap.org/data/2.5/uvi?lat=${MELBOURNE_COORDS.lat}&lon=${MELBOURNE_COORDS.lon}&appid=${WEATHER_API_KEY}`
                );
                weatherData.uvi = uvResponse.data.value;
            } catch {
                weatherData.uvi = weatherData.weather[0].main === 'Clear' ? 8 : 2;
            }

            // Cache the result
            try {
                await storage.setItem(CACHE_KEY, JSON.stringify({
                    data: weatherData,
                    timestamp: Date.now()
                }));
                console.log('[WeatherContext] Cache WRITE');
            } catch (cacheErr) {
                console.warn('[WeatherContext] Cache write failed:', cacheErr);
            }

            setWeather(weatherData);
            const condition = weatherData.weather[0].main.toLowerCase();
            const newTheme = getThemeFromCondition(condition);
            setTheme(newTheme);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching weather:', error);
            console.log('Using demo weather data as fallback');
            setWeather(DEMO_WEATHER);
            setTheme('sunny');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWeather();
    }, [overrideType]);

    const updateOverride = (type) => {
        setOverrideType(type === overrideType ? null : type);
    };

    const getBackgroundGradient = () => {
        if (overrideType === 'rainy') return 'from-slate-700 via-blue-900 to-indigo-900';
        if (overrideType === 'windy') return 'from-gray-400 via-slate-500 to-gray-600';
        return 'from-amber-400 via-orange-400 to-yellow-500';
    };

    const calculateSunstayScore = (venue) => {
        if (!weather) return 75;
        const temp = weather.main.temp;
        const condition = weather.weather[0].main.toLowerCase();
        let score = 50;

        if (temp >= 20 && temp <= 26) score += 35;
        else if (temp > 26) score += 15;
        else score += 10;

        if (condition.includes('clear')) score += 15;
        if (condition.includes('rain') && venue?.tags?.includes('Fireplace')) score += 20;

        return Math.max(0, Math.min(100, score));
    };

    const getFireplaceMode = () => theme === 'rainy' || overrideType === 'rainy';
    const getTemperature = () => weather ? Math.round(weather.main.temp) : null;
    const getUVIndex = () => weather?.uvi ?? 0;

    const getWeatherDescription = (venue) => {
        if (overrideType === 'perfect') return "Optimal conditions. Ideal for outdoor seating and sun exposure.";
        if (overrideType === 'windy') return "Gusty winds detected. Recommend sheltered spots with glass barriers.";
        if (overrideType === 'rainy') return "Rain activity. Fireplace mode active for indoor comfort.";
        return "Check back for live weather insights!";
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
    };

    return (
        <WeatherContext.Provider value={value}>
            {children}
        </WeatherContext.Provider>
    );
};
