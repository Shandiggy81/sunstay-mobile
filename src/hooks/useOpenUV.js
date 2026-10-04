import { useState, useEffect } from 'react';
import { shouldFetchRemote } from './shouldFetchRemote';
import { traceMapOperation } from '../utils/mapOperationTrace';
import { nextSunForecastRequestId, traceSunForecastLifecycle } from '../utils/sunForecastLifecycle';

// In-memory cache: key = "lat,lng", value = { burnTimeMins, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — UV index changes slowly
const FETCH_TIMEOUT_MS = 4000;

export function useOpenUV(lat, lng, { enabled = true, venueId = '' } = {}) {
  const [burnTimeMins, setBurnTimeMins] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shouldFetchRemote({ enabled, lat, lng })) return;
    if (!import.meta.env.VITE_OPENUV_API_KEY) return;
    let cancelled = false;

    const cacheKey = `${lat},${lng}`;
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setBurnTimeMins(cached.burnTimeMins);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    traceMapOperation('sun-forecast-fetch-start', { detail: 'useOpenUV', at: Date.now(), venueId });
    traceSunForecastLifecycle('sun-forecast-uv-fetch-start', {
      venueId,
      detail: 'useOpenUV',
      requestId: nextSunForecastRequestId('uv'),
    });
    let fetchTraced = false;
    const traceFetchEnd = () => {
      if (fetchTraced) return;
      fetchTraced = true;
      traceMapOperation('sun-forecast-fetch-end', { detail: 'useOpenUV', at: Date.now() });
    };

    // Hard 4s timeout via AbortController — a stalled OpenUV request must
    // never leave this widget stuck on `loading: true` indefinitely.
    let timedOut = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    // FIX: cast lat/lng via Number() before .toFixed() to prevent TypeError crash
    // when coordinates arrive as string primitives from venue data
    fetch(`https://api.openuv.io/api/v1/uv?lat=${Number(lat).toFixed(4)}&lng=${Number(lng).toFixed(4)}`, {
      headers: { 'x-access-token': import.meta.env.VITE_OPENUV_API_KEY },
      signal: controller.signal,
    })
      .then(r => {
        if (!r.ok) throw new Error(`OpenUV fetch failed: ${r.status}`);
        return r.json();
      })
      .then(data => {
        const mins = data?.result?.safe_exposure_time?.st3;
        if (cancelled) return;
        if (typeof mins === 'number') {
          _cache.set(cacheKey, { burnTimeMins: mins, expiresAt: Date.now() + CACHE_TTL_MS });
          setBurnTimeMins(mins);
        }
        setLoading(false);
        setError(false);
      })
      .catch(err => {
        if (cancelled) return;
        // A cleanup-triggered abort (unmount / lat-lng changed) is not a
        // real failure — only surface an error state for genuine timeouts
        // or network/parse failures.
        if (err?.name === 'AbortError' && !timedOut) return;
        console.warn('[useOpenUV] request failed or timed out:', err?.message);
        setBurnTimeMins(null);
        setLoading(false);
        setError(true);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        traceFetchEnd();
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
      traceFetchEnd();
    };
  }, [lat, lng, enabled, venueId]);

  return { burnTimeMins, loading, error };
}
