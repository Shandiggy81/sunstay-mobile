import { useState, useEffect } from 'react';

// In-memory cache: key = "lat,lng", value = { aqLabel, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 4000;

export function useOpenAQ(lat, lng) {
  const [aqLabel, setAqLabel] = useState('–');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lat || !lng) return;
    let cancelled = false;

    const cacheKey = `${lat},${lng}`;
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setAqLabel(cached.aqLabel);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    // Hard 4s timeout via AbortController — a stalled air-quality request
    // must never leave this widget stuck on `loading: true` indefinitely.
    let timedOut = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    async function fetchAQ() {
      try {
        // FIX: cast lat/lng via Number() before .toFixed() to prevent TypeError crash
        // when coordinates arrive as string primitives from venue data
        const params = new URLSearchParams({
          latitude: String(Number(lat).toFixed(4)),
          longitude: String(Number(lng).toFixed(4)),
          hourly: 'pm2_5',
          timezone: 'auto',
          forecast_days: '1',
        });
        const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('AQ fetch failed');
        const data = await res.json();

        const allValues = data?.hourly?.pm2_5 ?? [];
        // Start from current hour so we're not averaging midnight data at 3pm
        const currentHour = new Date().getHours();
        const values = allValues.slice(currentHour, currentHour + 8).filter(v => v !== null);

        let label = '–';
        if (values.length) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          if (avg <= 10) label = 'Pristine';
          else if (avg <= 25) label = 'Good';
          else if (avg <= 50) label = 'Moderate';
          else label = 'Poor';
        }

        _cache.set(cacheKey, { aqLabel: label, expiresAt: Date.now() + CACHE_TTL_MS });
        if (!cancelled) {
          setAqLabel(label);
          setError(false);
        }
      } catch (e) {
        if (cancelled) return;
        // A cleanup-triggered abort (unmount / lat-lng changed) is not a
        // real failure — only surface an error state for genuine timeouts
        // or network/parse failures.
        if (e?.name === 'AbortError' && !timedOut) return;
        console.error('AQ Error:', e?.message);
        setAqLabel('–');
        setError(true);
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    }

    fetchAQ();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [lat, lng]);

  return { aqLabel, loading, error };
}
