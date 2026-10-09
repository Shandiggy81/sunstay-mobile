/**
 * Sun Forecast request identity and diagnostic events.
 * A newer venue or a cleanup invalidates the previous id. Abort is not an error.
 */

import { ISOLATION_EVENT_KINDS, logIsolationEvent } from './iosCrashLog.js';

export const SUN_FORECAST_EVENTS = Object.freeze([
    'sun-forecast-tab-enter',
    'sun-forecast-fetch-start',
    'sun-forecast-fetch-success',
    'sun-forecast-fetch-error',
    'sun-forecast-fetch-abort',
    'sun-forecast-normalized',
    'sun-forecast-rendered',
    'sun-forecast-tab-exit',
    'sun-forecast-cleanup',
    'sun-forecast-error-boundary',
]);

export function createForecastGeneration() {
    return { current: 0, venueId: null };
}

export function beginForecastRequest(generation, venueId) {
    const id = generation.current + 1;
    return {
        generation: { current: id, venueId: venueId ?? null },
        requestId: id,
    };
}

export function isCurrentForecast(generation, requestId, venueId) {
    return generation.current === requestId && generation.venueId === (venueId ?? null);
}

export function invalidateForecast(generation) {
    return { current: generation.current + 1, venueId: null };
}

/** Non-OK HTTP is a failure. A parsed body is normalized by the caller. */
export function forecastHttpPlan(ok, status) {
    if (ok) return { action: 'parse', reason: 'ok' };
    return { action: 'error', reason: `http-${status || 'unknown'}` };
}

export function isForecastAbort(error) {
    return error?.name === 'AbortError';
}

export function noteSunForecast(seen, name, fields = {}) {
    if (!SUN_FORECAST_EVENTS.includes(name)) return null;
    const venueId = fields.venueId ?? '';
    const requestId = fields.requestId ?? '';
    const key = `${name}:${venueId}:${requestId}`;
    if (seen?.has(key)) return null;
    seen?.add(key);
    const count = Number.isFinite(fields.count) ? fields.count : '';
    const elapsed = Number.isFinite(fields.elapsedMs) ? `${fields.elapsedMs}ms` : '';
    const message = [
        name,
        venueId !== '' ? `v=${venueId}` : '',
        requestId !== '' ? `r=${requestId}` : '',
        count !== '' ? `n=${count}` : '',
        fields.state ? `s=${fields.state}` : '',
        elapsed,
        fields.reason ? `e=${fields.reason}` : '',
    ].filter(Boolean).join(' ');
    return logIsolationEvent({
        kind: ISOLATION_EVENT_KINDS.LAYOUT_OR_LOADING,
        message,
        source: 'SunForecast',
    });
}
