import { useState, useEffect } from 'react';

// In-memory cache: key = "lat,lng", value = { burnTimeMins, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — UV index changes slowly

export function useOpenUV(lat, lng) {
  const [burnTimeMins, setBurnTimeMins] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;
    if (!import.meta.env.VITE_OPENUV_API_KEY) return;
    let isMounted = true;

    const cacheKey = `${lat},${lng}`;
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setBurnTimeMins(cached.burnTimeMins);
      return;
    }

    fetch(`https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lng}`, {
      headers: { 'x-access-token': import.meta.env.VITE_OPENUV_API_KEY },
    })
      .then(r => r.json())
      .then(data => {
        const mins = data?.result?.safe_exposure_time?.st3;
        if (typeof mins === 'number') {
          _cache.set(cacheKey, { burnTimeMins: mins, expiresAt: Date.now() + CACHE_TTL_MS });
          if (isMounted) setBurnTimeMins(mins);
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [lat, lng]);

  return { burnTimeMins };
}
