/**
 * Sun Forecast request identity.
 * A newer venue or a cleanup invalidates the previous id. Abort is not an error.
 */

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
