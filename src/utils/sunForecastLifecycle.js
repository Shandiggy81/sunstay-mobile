/**
 * Sun Forecast lifecycle events for the matrix HUD.
 * The recorder is inert unless `?matrixHud=1` resolved at load.
 */

import { MATRIX_HUD, SUN_FORECAST_MODE } from './iosCrashIsolation.js';
import { getMapSessionDiagnostics } from './mapMarkerLifecycle.js';
import { traceMapOperation } from './mapOperationTrace.js';
import { buildSunForecastTrace } from './sunForecastMode.js';

let requestSerial = 0;

export function nextSunForecastRequestId(kind) {
    requestSerial += 1;
    return `${kind}-${requestSerial}`;
}

export function resetSunForecastRequestIds() {
    requestSerial = 0;
}

export function traceSunForecastLifecycle(name, fields = {}) {
    if (MATRIX_HUD !== true) return null;
    const generation = Number.isFinite(fields.generation)
        ? fields.generation
        : (getMapSessionDiagnostics().generation ?? null);
    const trace = buildSunForecastTrace(name, {
        ...fields,
        at: Number.isFinite(fields.at) ? fields.at : Date.now(),
        generation,
        mode: fields.mode || SUN_FORECAST_MODE,
    });
    return traceMapOperation(trace.name, trace);
}
