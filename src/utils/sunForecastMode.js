/**
 * Temporary Sun Forecast isolation for the iOS context-loss matrix.
 * Active only when matrixHud is on. Missing or unknown values stay `full`.
 *
 * ?matrixHud=1&sunForecastMode=full
 * ?matrixHud=1&sunForecastMode=static
 * ?matrixHud=1&sunForecastMode=no-aux
 * ?matrixHud=1&sunForecastMode=no-fetch
 */

export const SUN_FORECAST_MODES = Object.freeze(['full', 'static', 'no-aux', 'no-fetch']);

export const SUN_FORECAST_HOURLY_ROW_LIMIT = 12;

export const SUN_FORECAST_TRACE_EVENTS = Object.freeze([
    'sun-forecast-open',
    'sun-forecast-shell-mounted',
    'sun-forecast-core-mounted',
    'sun-forecast-animated-mounted',
    'sun-forecast-hourly-fetch-start',
    'sun-forecast-uv-fetch-start',
    'sun-forecast-aq-fetch-start',
    'sun-forecast-tomorrow-fetch-start',
    'sun-forecast-first-paint',
    'sun-forecast-cleanup',
]);

export function resolveSunForecastMode(value, matrixHud = false) {
    if (matrixHud !== true) return 'full';
    const normalized = String(value ?? '').trim().toLowerCase();
    return SUN_FORECAST_MODES.includes(normalized) ? normalized : 'full';
}

/**
 * What the Sun Forecast tab may mount for one diagnostic mode.
 * `full` is the production tree. No mode defers or retries requests.
 */
export function sunForecastMountPlan(mode = 'full') {
    const resolved = SUN_FORECAST_MODES.includes(mode) ? mode : 'full';
    const fetches = resolved === 'full' || resolved === 'no-aux' || resolved === 'static';
    const hourly = resolved !== 'no-fetch';
    const decorated = resolved === 'full' || resolved === 'no-aux';
    return {
        mode: resolved,
        mountShell: true,
        mountSolarPosition: resolved !== 'no-fetch',
        mountAnimatedTimeline: decorated,
        mountOptionalSections: decorated,
        mountHourlyStrip: hourly,
        startHourlyFetch: hourly && fetches,
        startOpenUv: resolved === 'full',
        startOpenAq: resolved === 'full',
        startTomorrow: resolved === 'full',
        startAuxiliaryFetches: resolved === 'full',
        schedulesDeferredWork: false,
        hourlyRowLimit: SUN_FORECAST_HOURLY_ROW_LIMIT,
        diagnosticLabel: resolved === 'full' ? '' : `Sun Forecast isolation: ${resolved}`,
    };
}

export function auxiliaryForecastEnabled(tabActive, mode = 'full') {
    return Boolean(tabActive) && sunForecastMountPlan(mode).startAuxiliaryFetches;
}

export function hourlyForecastEnabled(panelEnabled, mode = 'full') {
    return Boolean(panelEnabled) && sunForecastMountPlan(mode).startHourlyFetch;
}

/** Fields recorded on a Sun Forecast lifecycle event. No payloads. */
export function buildSunForecastTrace(name, fields = {}) {
    const at = Number.isFinite(fields.at) ? fields.at : null;
    const generation = Number.isFinite(fields.generation) ? fields.generation : null;
    return {
        name: String(name || ''),
        at,
        venueId: fields.venueId == null ? '' : String(fields.venueId).slice(0, 80),
        generation,
        mode: SUN_FORECAST_MODES.includes(fields.mode) ? fields.mode : 'full',
        requestId: fields.requestId == null || fields.requestId === ''
            ? ''
            : String(fields.requestId).slice(0, 40),
        detail: fields.detail == null ? '' : String(fields.detail).slice(0, 80),
    };
}
