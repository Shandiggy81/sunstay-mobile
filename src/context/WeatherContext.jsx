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
    const [theme, setTheme] = useState('sunny'); // default theme

    const WEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';
    const MELBOURNE_COORDS = { lat: -37.8136, lon: 144.9631 };
    const CACHE_KEY = `sunstay_weather_${MELBOURNE_COORDS.lat.toFixed(2)}_${MELBOURNE_COORDS.lon.toFixed(2)}`;
    const CACHE_EXPIRY = 900000; // 15 minutes

    useEffect(() => {
        fetchWeather();
        // Refresh weather every 30 minutes
        const interval = setInterval(fetchWeather, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchWeather = async () => {
        // Demo fallback weather for Melbourne (used when API unavailable)
        const DEMO_WEATHER = {
            main: { temp: 22, feels_like: 21, humidity: 55 },
            weather: [{ main: 'Clear', description: 'clear sky', icon: '01d' }],
            wind: { speed: 3.5 },
            name: 'Melbourne',
            uvi: 8, // High UV for demo
            rain_arrival: 45, // Demo: Rain in 45 min
            rain_clearing_time: '3:00 PM',
            next_dry_window: '7:00 PM - 10:00 PM',
            hourly: [
                { dt: Date.now() / 1000 + 3600 * 0, temp: 22, weather: [{ main: 'Clear', icon: '01d' }], wind_speed: 3, uvi: 8 },
                { dt: Date.now() / 1000 + 3600 * 1, temp: 24, weather: [{ main: 'Clear', icon: '01d' }], wind_speed: 4, uvi: 9 },
                { dt: Date.now() / 1000 + 3600 * 2, temp: 25, weather: [{ main: 'Clear', icon: '01d' }], wind_speed: 5, uvi: 10 },
                { dt: Date.now() / 1000 + 3600 * 3, temp: 24, weather: [{ main: 'Clouds', icon: '02d' }], wind_speed: 12, uvi: 6 },
                { dt: Date.now() / 1000 + 3600 * 4, temp: 23, weather: [{ main: 'Clouds', icon: '03d' }], wind_speed: 15, uvi: 4 },
                { dt: Date.now() / 1000 + 3600 * 5, temp: 22, weather: [{ main: 'Clear', icon: '01d' }], wind_speed: 6, uvi: 2 },
                { dt: Date.now() / 1000 + 3600 * 6, temp: 21, weather: [{ main: 'Clear', icon: '01d' }], wind_speed: 4, uvi: 1 },
                { dt: Date.now() / 1000 + 3600 * 7, temp: 20, weather: [{ main: 'Clear', icon: '01n' }], wind_speed: 3, uvi: 0 },
                { dt: Date.now() / 1000 + 3600 * 8, temp: 19, weather: [{ main: 'Clear', icon: '01n' }], wind_speed: 2, uvi: 0 },
                { dt: Date.now() / 1000 + 3600 * 9, temp: 18, weather: [{ main: 'Clear', icon: '01n' }], wind_speed: 2, uvi: 0 },
                { dt: Date.now() / 1000 + 3600 * 10, temp: 17, weather: [{ main: 'Clear', icon: '01n' }], wind_speed: 3, uvi: 0 },
                { dt: Date.now() / 1000 + 3600 * 11, temp: 16, weather: [{ main: 'Clear', icon: '01n' }], wind_speed: 2, uvi: 0 },
            ]
        };

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

    const getThemeFromCondition = (condition) => {
        if (condition.includes('rain') || condition.includes('drizzle')) {
            return 'rainy';
        } else if (condition.includes('cloud')) {
            return 'cloudy';
        } else {
            return 'sunny';
        }
    };

    const getBackgroundGradient = () => {
        switch (theme) {
            case 'sunny':
                return 'from-amber-400 via-orange-400 to-yellow-500';
            case 'rainy':
                return 'from-slate-700 via-blue-900 to-indigo-900';
            case 'cloudy':
                return 'from-gray-400 via-slate-500 to-gray-600';
            default:
                return 'from-amber-400 via-orange-400 to-yellow-500';
        }
    };

    const calculateSunstayScore = (venue) => {
        if (!weather) return 75; // default score

        const temp = weather.main.temp;
        const condition = weather.weather[0].main.toLowerCase();

        let score = 50; // base score

        // Temperature scoring (optimal 18-26°C)
        if (temp >= 18 && temp <= 26) {
            score += 30;
        } else if (temp >= 15 && temp < 18) {
            score += 20;
        } else if (temp > 26 && temp <= 30) {
            score += 20;
        } else if (temp > 30) {
            score += 10;
        } else {
            score += 5;
        }

        // Weather condition scoring
        if (condition.includes('clear') || condition.includes('sun')) {
            score += 20;
        } else if (condition.includes('cloud')) {
            score += 10;
        } else if (condition.includes('rain')) {
            // Rainy weather - boost for cozy/fireplace venues
            if (venue && venue.tags && (venue.tags.includes('Fireplace') || venue.tags.includes('Cozy'))) {
                score += 15;
            } else {
                score -= 20;
            }
        }

        // Venue-specific bonuses
        if (venue && venue.tags) {
            if (theme === 'sunny' && venue.tags.includes('Sunny')) {
                score += 10;
            }
            if (theme === 'rainy' && venue.tags.includes('Fireplace')) {
                score += 15;
            }
        }

        // UV Scoring (High UV without shade reduces score)
        const uvi = weather.uvi ?? 0;
        if (uvi >= 6) {
            const hasShade = venue && venue.tags && (venue.tags.includes('Shaded') || venue.tags.includes('Covered') || venue.tags.includes('Garden'));
            if (!hasShade) {
                score -= 15; // Penalty for high UV exposure
            } else {
                score += 5; // Bonus for sun-safe shelter
            }
        }

        // Clamp score between 0-100
        return Math.max(0, Math.min(100, score));
    };

    const getFireplaceMode = () => {
        return theme === 'rainy';
    };

    // Get current temperature (rounded)
    const getTemperature = () => {
        if (!weather) return null;
        return Math.round(weather.main.temp);
    };

    // New: Get UV Index
    const getUVIndex = () => {
        return weather?.uvi ?? 0;
    };

    // Generate dynamic weather description based on conditions
    const getWeatherDescription = (venue) => {
        const temp = getTemperature();

        if (!weather || temp === null) {
            return "Check back for live weather insights!";
        }

        const condition = weather.weather[0].main.toLowerCase();
        const hasFireplace = venue?.tags?.includes('Fireplace');
        const hasHeaters = venue?.tags?.includes('Heaters');
        const isSunny = venue?.tags?.includes('Sunny');
        const isRooftop = venue?.tags?.includes('Rooftop');

        // Rainy conditions
        if (condition.includes('rain') || condition.includes('drizzle')) {
            if (hasFireplace) {
                return `Rain outside, cozy inside. Perfect fireplace weather at ${temp}°C.`;
            } else if (hasHeaters) {
                return `Rain starting soon, grab a heater spot at ${temp}°C.`;
            } else {
                return `${temp}°C with rain - consider indoor seating.`;
            }
        }

        // Cloudy conditions
        if (condition.includes('cloud')) {
            if (temp >= 18 && temp <= 24) {
                return `Mild ${temp}°C under clouds. Great for outdoor drinks.`;
            } else if (temp < 18) {
                return `Cool ${temp}°C today. A heater would be nice!`;
            } else {
                return `${temp}°C with cloud cover. Pleasant outdoor conditions.`;
            }
        }

        // Clear/Sunny conditions
        if (temp >= 20 && temp <= 26) {
            if (isSunny || isRooftop) {
                return `Perfect ${temp}°C for a pint in the sun! ☀️`;
            }
            return `Ideal ${temp}°C weather. Get a sunny spot!`;
        } else if (temp > 26 && temp <= 32) {
            return `Hot ${temp}°C - find some shade and stay hydrated!`;
        } else if (temp > 32) {
            return `Scorching ${temp}°C! Air-con or icy drinks recommended.`;
        } else if (temp >= 15 && temp < 20) {
            return `Pleasant ${temp}°C. A light jacket might help.`;
        } else {
            return `Cool ${temp}°C. Bundle up and enjoy the vibe!`;
        }
    };

    // Get card background gradient based on weather theme
    const getCardBackground = () => {
        switch (theme) {
            case 'sunny':
                return 'from-amber-50 via-orange-50 to-yellow-50';
            case 'rainy':
                return 'from-slate-100 via-blue-50 to-indigo-50';
            case 'cloudy':
                return 'from-gray-50 via-slate-100 to-gray-100';
            default:
                return 'from-amber-50 via-orange-50 to-yellow-50';
        }
    };

    // Get card border/accent color based on weather
    const getCardAccent = () => {
        switch (theme) {
            case 'sunny':
                return 'border-amber-300/50';
            case 'rainy':
                return 'border-blue-300/50';
            case 'cloudy':
                return 'border-slate-300/50';
            default:
                return 'border-amber-300/50';
        }
    };

    const value = {
        weather,
        loading,
        theme,
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
