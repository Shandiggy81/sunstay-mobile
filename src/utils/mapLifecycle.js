/**
 * Mapbox camera and teardown helpers for VenueMap.
 *
 * The map stays mounted for the whole session. A new map generation is only
 * created after WebGL context loss, when the user taps Resume map; these
 * helpers capture the camera before teardown, put it back on the new
 * generation, and stop timers from an old generation touching the new map.
 */

export function captureMapCamera(map) {
    if (!map || typeof map.getCenter !== 'function') return null;
    try {
        const center = map.getCenter();
        const camera = {
            lng: Number(center?.lng),
            lat: Number(center?.lat),
            zoom: Number(typeof map.getZoom === 'function' ? map.getZoom() : NaN),
            bearing: Number(typeof map.getBearing === 'function' ? map.getBearing() : NaN),
            pitch: Number(typeof map.getPitch === 'function' ? map.getPitch() : NaN),
        };
        if (!Object.values(camera).every(Number.isFinite)) return null;
        return camera;
    } catch {
        return null;
    }
}

/** Public `map.jumpTo` only. Returns skipped, success, or failure. */
export function restoreMapCamera(map, camera) {
    if (!camera) return 'skipped';
    if (!map || typeof map.jumpTo !== 'function') return 'failure';
    try {
        map.jumpTo({
            center: [camera.lng, camera.lat],
            zoom: camera.zoom,
            bearing: camera.bearing,
            pitch: camera.pitch,
        });
        return 'success';
    } catch {
        return 'failure';
    }
}

function detach(target, type, handler, capture = false) {
    if (!target || typeof target.removeEventListener !== 'function' || typeof handler !== 'function') return false;
    target.removeEventListener(type, handler, capture);
    return true;
}

function releaseMarkerNode(marker) {
    try {
        marker?.getPopup?.()?.remove?.();
    } catch {
        // A popup that is already gone should not keep the marker on the map.
    }
    try {
        marker?.remove?.();
    } catch {
        // Fall through to the element so a failed Marker.remove cannot leak DOM.
    }
    try {
        const element = marker?.getElement?.();
        if (element?.parentNode) element.remove();
    } catch {
        // The node may already have been detached by Marker.remove().
    }
}

/**
 * Marker, DOM listener, and `map.remove()` cleanup. A second call is a no-op.
 */
export function releaseMapOwners(resources) {
    const current = resources ?? {};
    if (current.released) {
        return {
            ...current,
            released: true,
            markerCleanups: current.markerCleanups ?? 1,
            listenerCleanups: current.listenerCleanups ?? 1,
            removeCalls: current.removeCalls ?? 1,
        };
    }
    let markerCleanups = 0;
    for (const marker of current.markers || []) {
        releaseMarkerNode(marker);
        markerCleanups += 1;
    }
    let listenerCleanups = 0;
    for (const listener of current.listeners || []) {
        if (detach(listener?.target, listener?.type, listener?.handler, listener?.capture === true)) {
            listenerCleanups += 1;
        }
    }
    let removeCalls = 0;
    let canvasReset = false;
    let canvasRemoved = false;
    let removeError = null;
    if (current.map && typeof current.map.remove === 'function') {
        let canvas = null;
        try {
            canvas = current.map.getCanvas?.() ?? null;
        } catch (error) {
            removeError = error?.message || 'canvas-lookup-failed';
        }
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvasReset = true;
        }
        try {
            current.map.remove();
            removeCalls = 1;
        } catch (error) {
            removeCalls = 1;
            removeError = error?.message || 'map-remove-failed';
            const container = current.map.getContainer?.();
            if (canvas && container && canvas.parentNode === container) {
                canvas.remove();
                canvasRemoved = true;
            }
        }
    }
    return {
        released: true,
        markers: [],
        listeners: [],
        map: null,
        markerCleanups,
        listenerCleanups,
        removeCalls,
        canvasReset,
        canvasRemoved,
        removeError,
    };
}

/**
 * Marker sync for a restored generation waits until that generation's map
 * is ready. A callback from an older generation does not move markers.
 */
export function markerSyncAfterRestore({
    mapReady = false,
    generation = 0,
    currentGeneration = 0,
} = {}) {
    if (!mapReady) return { sync: false, reason: 'map-not-ready' };
    if (generation !== currentGeneration) return { sync: false, reason: 'stale' };
    return { sync: true, reason: 'generation-ready' };
}

/** One camera restore per map generation. */
export function claimCameraRestore(claimed, generation) {
    const next = claimed ?? new Set();
    if (next.has(generation)) return { claimed: next, restore: false };
    const updated = new Set(next);
    updated.add(generation);
    return { claimed: updated, restore: true };
}

export function createGenerationCamera(generation) {
    return {
        generation,
        active: true,
        timers: [],
        stopCalls: 0,
        captures: 0,
        camera: null,
        ignored: [],
        order: [],
    };
}

function generationList(value) {
    return Array.isArray(value) ? value : [];
}

function generationCount(value) {
    return Number.isFinite(value) ? value : 0;
}

export function trackCameraTimer(state, timer) {
    if (!state?.active || !timer) return state;
    return { ...state, timers: [...generationList(state.timers), timer] };
}

/** A retired generation cannot fly, resize, or sync markers on the live map. */
export function dispatchGenerationCallback(state, generation, kind, run) {
    if (!state || state.active !== true || state.generation !== generation) {
        return {
            state: state
                ? { ...state, ignored: [...generationList(state.ignored), kind] }
                : state,
            ran: false,
        };
    }
    run?.();
    return { state, ran: true };
}

/**
 * Cancel pending camera timers, mark the generation inactive, then stop the
 * animation. A second call does not stop the map again. Missing collection
 * fields are empty lists so an incomplete guard cannot throw during unmount.
 */
export function beginGenerationTeardown(state, map) {
    const current = state ?? createGenerationCamera(0);
    const timers = generationList(current.timers);
    const stopCalls = generationCount(current.stopCalls);
    if (current.active !== true && stopCalls > 0) return current;
    for (const timer of timers) {
        if (!timer?.cleared) timer?.cancel?.();
    }
    const next = {
        ...current,
        active: false,
        timers: timers.map((timer) => ({ ...timer, cleared: true })),
        stopCalls: stopCalls + 1,
        order: [...generationList(current.order)],
    };
    if (map && typeof map.stop === 'function') {
        try {
            map.stop();
            next.order = [...next.order, 'stop'];
        } catch {
            next.order = [...next.order, 'stop-failed'];
        }
    }
    return next;
}

/** Capture once, and only after the generation has been stopped. */
export function captureGenerationCamera(state, map) {
    const current = state ?? createGenerationCamera(0);
    const stopCalls = generationCount(current.stopCalls);
    const captures = generationCount(current.captures);
    if (current.active === true || stopCalls < 1) return { ...current, captured: false };
    if (captures >= 1) return { ...current, captured: false };
    return {
        ...current,
        captures: 1,
        camera: captureMapCamera(map),
        captured: true,
        order: [...generationList(current.order), 'capture'],
    };
}

export function teardownGenerationCamera(state, map) {
    return captureGenerationCamera(beginGenerationTeardown(state, map), map);
}
