import { useState, useEffect } from 'react';

// In-memory cache: key = "lat,lng", value = { result, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes high-accuracy nowcasting

export function useTomorrowRain(lat, lng) {
  const [isRainStartingSoon, setIsRainStartingSoon] = useState(false);
  const [minutesUntilRain, setMinutesUntilRain]     = useState(0);
  const [rainArrivalMins, setRainArrivalMins]       = useState(null);
  const [rainArrivalLabel, setRainArrivalLabel]     = useState(null);

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

        const cacheKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
        const cached = _cache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
          if (isMounted) {
            setIsRainStartingSoon(cached.result.isRainStartingSoon);
            setMinutesUntilRain(cached.result.minutesUntilRain);
            setRainArrivalMins(cached.result.rainArrivalMins);
            setRainArrivalLabel(cached.result.rainArrivalLabel);
          }
          return;
        }

        const url = `https://api.tomorrow.io/v4/timelines?location=${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}&fields=precipitationIntensity&timesteps=1m&units=metric&apikey=${apiKey}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`Tomorrow.io error: ${res.status}`);

        const data = await res.json();
        const intervals = data?.data?.timelines?.[0]?.intervals;
        if (!intervals) return;

        const nextHour = intervals.slice(0, 60);
        let rainMin = -1;
        for (let i = 0; i < nextHour.length; i++) {
          const intensity = nextHour[i].values?.precipitationIntensity || 0;
          if (intensity > 0.1) {
            rainMin = i;
            break;
          }
        }

        // FIX: rainMin >= 0 catches rainMin === 0 (rain starting right now)
        const hasRain = rainMin >= 0;
        const arrivalMins  = hasRain ? rainMin : null;
        const arrivalLabel = rainMin === 0
          ? 'Rain starting now'
          : rainMin > 0
            ? `Rain likely in ~${rainMin} mins`
            : null;

        const result = {
          isRainStartingSoon: hasRain,
          minutesUntilRain:   hasRain ? rainMin : 0,
          rainArrivalMins:    arrivalMins,
          rainArrivalLabel:   arrivalLabel,
        };

        _cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

        if (isMounted) {
          setIsRainStartingSoon(result.isRainStartingSoon);
          setMinutesUntilRain(result.minutesUntilRain);
          setRainArrivalMins(result.rainArrivalMins);
          setRainArrivalLabel(result.rainArrivalLabel);
        }
      } catch (err) {
        console.error('Tomorrow.io fetch failed:', err);
        if (isMounted) {
          setIsRainStartingSoon(false);
          setMinutesUntilRain(0);
          setRainArrivalMins(null);
          setRainArrivalLabel(null);
        }
      }
    }

    fetchRain();
    return () => { isMounted = false; };
  }, [lat, lng]);

  return { isRainStartingSoon, minutesUntilRain, rainArrivalMins, rainArrivalLabel };
}
