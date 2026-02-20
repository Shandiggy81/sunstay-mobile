import { useState, useCallback } from 'react';
import { storage } from '../utils/platform';

const CACHE_KEY_PREFIX = 'sunstay_weather_';
const CACHE_EXPIRY = 900000; // 15 Minutes

export const useWeather = () => {
    const [loading, setLoading] = useState(false);

    const fetchWeatherWithCache = useCallback(async (lat, lon) => {
        const bucket = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
        const cacheKey = `${CACHE_KEY_PREFIX}${bucket}`;

        setLoading(true);
        try {
            const cachedString = await storage.getItem(cacheKey);
            if (cachedString) {
                const { data, timestamp } = JSON.parse(cachedString);
                if (Date.now() - timestamp < CACHE_EXPIRY) {
                    setLoading(false);
                    return data;
                }
            }

            const response = await fetch(`{{weather_api_url}}?lat=${lat}&lon=${lon}`);
            const freshData = await response.json();

            await storage.setItem(cacheKey, JSON.stringify({
                data: freshData,
                timestamp: Date.now()
            }));

            return freshData;
        } catch (error) {
            console.error("[SunStay Weather] Error:", error);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return { fetchWeatherWithCache, loading };
};
