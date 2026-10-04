/**
 * In-memory ring of application-owned map operations for the iOS
 * context-loss HUD. Callers record only while the existing diagnostic
 * mode is on (Vite DEV or ?matrixHud=1). Production stays a no-op.
 */

import { MATRIX_HUD } from './iosCrashIsolation.js';

const MAX_EVENTS = 24;

let sequence = 0;
let events = [];

export function isMapOperationTraceEnabled() {
    return Boolean(import.meta.env?.DEV) || MATRIX_HUD === true;
}

export function resetMapOperationTrace() {
    sequence = 0;
    events = [];
    return getMapOperationTrace();
}

export function noteMapOperation(name, fields = {}) {
    const previous = events.at(-1) || null;
    const event = {
        seq: sequence + 1,
        name,
        at: fields.at ?? 0,
        generation: fields.generation ?? null,
        instance: fields.instance ?? null,
        phase: fields.phase ?? null,
        venueId: fields.venueId ?? '',
        detail: fields.detail ?? '',
        mode: fields.mode ?? '',
        requestId: fields.requestId == null || fields.requestId === '' ? '' : String(fields.requestId),
        preceding: name === 'context-loss' ? (previous?.name ?? null) : null,
    };
    sequence = event.seq;
    if (fields.at == null) event.at = sequence;
    events = [...events, event].slice(-MAX_EVENTS);
    return event;
}

/** Records one operation when diagnostic mode is on. Otherwise does nothing. */
export function traceMapOperation(name, fields) {
    if (!isMapOperationTraceEnabled()) return null;
    return noteMapOperation(name, fields);
}

export function getMapOperationTrace() {
    const loss = [...events].reverse().find((event) => event.name === 'context-loss') || null;
    return {
        events: events.slice(),
        last: events.at(-1)?.name ?? '',
        precedingLoss: loss?.preceding ?? '',
        enabled: isMapOperationTraceEnabled(),
    };
}
