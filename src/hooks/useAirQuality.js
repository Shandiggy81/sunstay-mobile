import { useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/platform';

const CACHE_KEY_PREFIX = 'sunstay_air_quality_';
const CACHE_EXPIRY = 20 * 60 * 1000;

const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const getAirLabel = (pm25Value) => {
    if (pm25Value == null) return '--';
    if (pm25Value <= 12) return 'Pristine';
    if (pm25Value <= 35) return 'Good';
    if (pm25Value <= 55) return 'Moderate';
    return 'Poor';
};

const extractPm25FromOpenAQ = (payload) => {
    const stack = [payload];

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;

        if (Array.isArray(node)) {
            for (const item of node) stack.push(item);
            continue;
        }

        const parameterName = String(
            node.parameter?.name ?? node.parameter ?? node.name ?? node.parameterCode ?? ''
        ).toLowerCase();

        const value = toNumber(node.value ?? node.average ?? node.lastValue ?? node.concentration);
        if ((parameterName.includes('pm25') || parameterName.includes('pm2.5')) && value != null) {
            return value;
        }

        for (const child of Object.values(node)) {
            if (child && typeof child === 'object') stack.push(child);
        }
    }

    return null;
};

const fetchFromOpenAQ = async (lat, lng) => {
    const apiKey = (import.meta.env.VITE_OPENAQ_API_KEY || '').trim();
    if (!apiKey) return null;

    const headers = { 'X-API-Key': apiKey };
    const baseUrl = 'https://api.openaq.org/v3';
    const locationUrl = `${baseUrl}/locations?coordinates=${lat},${lng}&radius=10000&limit=1&order_by=distance&sort=asc`;

    const locationResponse = await fetch(locationUrl, { headers });
    if (!locationResponse.ok) return null;

    const locationPayload = await locationResponse.json();
    const locationId = locationPayload?.results?.[0]?.id;
    if (!locationId) return null;

    const latestUrl = `${baseUrl}/locations/${locationId}/latest?limit=100`;
    const latestResponse = await fetch(latestUrl, { headers });
    if (!latestResponse.ok) return null;

    const latestPayload = await latestResponse.json();
    const pm25 = extractPm25FromOpenAQ(latestPayload);
    if (pm25 == null) return null;

    return {
        pm25,
        label: getAirLabel(pm25),
        source: 'openaq',
        updatedAt: Date.now(),
    };
};

const fetchFromOpenMeteo = async (lat, lng) => {
    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        current: 'pm2_5',
        timezone: 'auto',
    });

    const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`);
    if (!response.ok) return null;

    const payload = await response.json();
    const pm25 = toNumber(payload?.current?.pm2_5);
    if (pm25 == null) return null;

    return {
        pm25,
        label: getAirLabel(pm25),
        source: 'open-meteo',
        updatedAt: Date.now(),
    };
};

export const useAirQuality = (lat, lng) => {
    const [airQuality, setAirQuality] = useState(null);
    const [loading, setLoading] = useState(false);

    const cacheKey = useMemo(() => {
        if (lat == null || lng == null) return null;
        return `${CACHE_KEY_PREFIX}${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}`;
    }, [lat, lng]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (!cacheKey) {
                setAirQuality(null);
                setLoading(false);
                return;
            }

            setLoading(true);

            try {
                const cachedString = await storage.getItem(cacheKey);
                if (cachedString) {
                    const { data, timestamp } = JSON.parse(cachedString);
                    if (Date.now() - timestamp < CACHE_EXPIRY) {
                        if (!cancelled) {
                            setAirQuality(data);
                            setLoading(false);
                        }
                        return;
                    }
                }
            } catch {
                // cache miss
            }

            let liveData = null;

            try {
                liveData = await fetchFromOpenAQ(lat, lng);
            } catch {
                liveData = null;
            }

            if (!liveData) {
                try {
                    liveData = await fetchFromOpenMeteo(lat, lng);
                } catch {
                    liveData = null;
                }
            }

            if (!cancelled) {
                setAirQuality(liveData);
                setLoading(false);
            }

            if (liveData) {
                try {
                    await storage.setItem(cacheKey, JSON.stringify({ data: liveData, timestamp: Date.now() }));
                } catch {
                    // cache write failed
                }
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [lat, lng, cacheKey]);

    return { airQuality, loading };
};

