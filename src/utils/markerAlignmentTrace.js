/**
 * Diagnostic comparison of Mapbox's projected pin position against the
 * marker element's rendered translate. Read-only. No-op unless the
 * isolation HUD is on (Vite DEV or ?matrixHud=1).
 */

import { MATRIX_HUD } from './iosCrashIsolation.js';

export const MARKER_ALIGNMENT_THRESHOLD_PX = 2;
const MAX_ALIGNMENT_EVENTS = 16;

let seq = 0;
let events = [];
const listeners = new Set();

export function isMarkerAlignmentTraceEnabled() {
    return Boolean(import.meta.env?.DEV) || MATRIX_HUD === true;
}

export function resetMarkerAlignmentTrace() {
    seq = 0;
    events = [];
    return getMarkerAlignmentTrace();
}

export function subscribeMarkerAlignmentTrace(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getMarkerAlignmentTrace() {
    return {
        enabled: isMarkerAlignmentTraceEnabled(),
        events: events.slice(),
        last: events.length ? events[events.length - 1].line : '',
    };
}

/** First translate is Mapbox's projected point. Later translates are anchor offsets. */
export function parseMarkerTranslate(transform) {
    if (typeof transform !== 'string' || transform === '' || transform === 'none') return null;
    const match = /translate3d\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px|translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/i.exec(transform);
    if (!match) return null;
    const x = Number(match[1] ?? match[3]);
    const y = Number(match[2] ?? match[4]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

function compact(value) {
    if (!Number.isFinite(value)) return '-';
    const rounded = Math.round(value * 10) / 10;
    return String(rounded);
}

function markerEntries(activeMarkers) {
    if (!activeMarkers) return [];
    if (Array.isArray(activeMarkers)) {
        return activeMarkers.map((record, index) => [record?.id ?? String(index), record]);
    }
    return Object.entries(activeMarkers);
}

function readCamera(map) {
    const read = (method) => {
        try {
            const value = map?.[method]?.();
            return Number.isFinite(value) ? value : null;
        } catch {
            return null;
        }
    };
    return {
        pitch: read('getPitch'),
        bearing: read('getBearing'),
        zoom: read('getZoom'),
    };
}

function generationOf(record) {
    const generation = record?.generation;
    return Number.isFinite(generation) ? generation : null;
}

/**
 * Compare each mounted marker once. Records only pins whose screen delta
 * exceeds the threshold. A missing map, project, or transform is skipped.
 */
export function checkMarkerAlignment(map, activeMarkers, {
    trigger = 'zoomend',
    enabled = isMarkerAlignmentTraceEnabled(),
    thresholdPx = MARKER_ALIGNMENT_THRESHOLD_PX,
} = {}) {
    if (!enabled) return { checked: 0, drifted: [] };
    const entries = markerEntries(activeMarkers);
    if (!map || typeof map.project !== 'function' || entries.length === 0) {
        return { checked: 0, drifted: [] };
    }
    const camera = readCamera(map);
    const drifted = [];
    let checked = 0;
    for (const [id, record] of entries) {
        const marker = record?.marker;
        const element = record?.el ?? marker?.getElement?.();
        if (!marker || typeof marker.getLngLat !== 'function' || !element) continue;
        let lngLat = null;
        let expected = null;
        try {
            lngLat = marker.getLngLat();
            expected = map.project(lngLat);
        } catch {
            continue;
        }
        const actual = parseMarkerTranslate(element.style?.transform);
        if (!expected || !Number.isFinite(expected.x) || !Number.isFinite(expected.y) || !actual) continue;
        checked += 1;
        const dx = actual.x - expected.x;
        const dy = actual.y - expected.y;
        if (Math.hypot(dx, dy) <= thresholdPx) continue;
        const generation = generationOf(record);
        const event = {
            seq: ++seq,
            trigger,
            id: String(id),
            dx,
            dy,
            pitch: camera.pitch,
            bearing: camera.bearing,
            zoom: camera.zoom,
            generation,
            at: Date.now(),
        };
        event.line = `${event.seq} align ${trigger} ${event.id} dx=${compact(dx)} dy=${compact(dy)} z=${compact(camera.zoom)} p=${compact(camera.pitch)} b=${compact(camera.bearing)} g=${generation == null ? '-' : generation}`;
        drifted.push(event);
    }
    if (drifted.length) {
        events = events.concat(drifted).slice(-MAX_ALIGNMENT_EVENTS);
        listeners.forEach((listener) => {
            try { listener(); } catch { /* HUD listeners must not throw into the map */ }
        });
    }
    return { checked, drifted };
}
