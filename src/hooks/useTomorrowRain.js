import { useState, useEffect } from 'react';

// In-memory cache: key = "lat,lng", value = { result, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function useTomorrowRain(lat, lng) {
  const [isRainStartingSoon, setIsRainStartingSoon] = useState(false);
  const [minutesUntilRain, setMinutesUntilRain] = useState(0);

  useEffect(() => {
    if (!lat || !lng) return;
    let isMounted = true;

    async function fetchRain() {
      try {
        const apiKey = import.meta.env.VITE_TOMORROW_API_KEY;
        if (!apiKey) {
          console.warn('Tomorrow.io API key missing');
          return;
        }

        const cacheKey = `${lat},${lng}`;
        const cached = _cache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
          if (isMounted) {
            setIsRainStartingSoon(cached.result.isRainStartingSoon);
            setMinutesUntilRain(cached.result.minutesUntilRain);
          }
          return;
        }

        const url = `https://api.tomorrow.io/v4/timelines?location=${lat},${lng}&fields=precipitationIntensity&timesteps=1m&units=metric&apikey=${apiKey}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`Tomorrow.io error: ${res.status}`);

        const data = await res.json();
        const intervals = data?.data?.timelines?.[0]?.intervals;
        if (!intervals) return;

        const nextHour = intervals.slice(0, 60);
        let rainMin = -1;
        for (let i = 0; i < nextHour.length; i++) {
          const intensity = nextHour[i].values?.precipitationIntensity || 0;
          if (intensity > 0.1) { rainMin = i; break; }
        }

        const result = {
          isRainStartingSoon: rainMin > 0,
          minutesUntilRain: rainMin > 0 ? rainMin : 0,
        };

        _cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

        if (isMounted) {
          setIsRainStartingSoon(result.isRainStartingSoon);
          setMinutesUntilRain(result.minutesUntilRain);
        }
      } catch (err) {
        console.error('Tomorrow.io fetch failed:', err);
        if (isMounted) {
          setIsRainStartingSoon(false);
          setMinutesUntilRain(0);
        }
      }
    }

    fetchRain();
    return () => { isMounted = false; };
  }, [lat, lng]);

  return { isRainStartingSoon, minutesUntilRain };
}
