/**
 * Opt-in Mapbox mount decision for the iOS crash matrix.
 * Default and `keep` leave the map mounted. `unmount-expanded` drops it
 * only while the venue sheet is in the stable fully expanded state.
 * Drag offsets are ignored so a swipe cannot create a mount loop.
 */

import { ISOLATION_EVENT_KINDS, logIsolationEvent } from './iosCrashLog.js';

export const MAP_LIFECYCLE_KEEP = 'keep';
export const MAP_LIFECYCLE_UNMOUNT_EXPANDED = 'unmount-expanded';

export function parseMapLifecycle(value) {
    if (value == null) return MAP_LIFECYCLE_KEEP;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '' || normalized === 'keep' || normalized === 'default') {
        return MAP_LIFECYCLE_KEEP;
    }
    if (normalized === 'unmount-expanded') return MAP_LIFECYCLE_UNMOUNT_EXPANDED;
    return MAP_LIFECYCLE_KEEP;
}

export function shouldMountMap({
    mapboxEnabled = true,
    lifecycle = MAP_LIFECYCLE_KEEP,
    sheetExpanded = false,
} = {}) {
    if (!mapboxEnabled) return false;
    if (lifecycle !== MAP_LIFECYCLE_UNMOUNT_EXPANDED) return true;
    return sheetExpanded !== true;
}

export function createMapMountState(mounted = true) {
    return { mounted, transitions: 0 };
}

/** Identical sheet states, including drag samples, do not add a transition. */
export function reduceSheetMount(state, input) {
    const mounted = shouldMountMap(input);
    if (state.mounted === mounted) return state;
    return { mounted, transitions: state.transitions + 1 };
}

export function createMapLifecycleSession() {
    return {
        mountCount: 0,
        removeCount: 0,
        liveInstances: 0,
        lastUnmountAt: null,
        lastRemountDurationMs: null,
        duplicateDetected: false,
        cameraRestore: 'not-attempted',
        markerCleanups: 0,
        listenerCleanups: 0,
    };
}

export function beginMapMount(session, now = Date.now()) {
    const current = session ?? createMapLifecycleSession();
    if (current.liveInstances > 0) {
        return {
            create: false,
            session: { ...current, duplicateDetected: true },
        };
    }
    const remounting = current.removeCount > 0 && current.lastUnmountAt != null;
    // Gap from teardown until the next mount claim. Includes the paused wait
    // and cooldown, not Mapbox load time.
    return {
        create: true,
        session: {
            ...current,
            mountCount: current.mountCount + 1,
            liveInstances: 1,
            lastRemountDurationMs: remounting ? Math.max(0, now - current.lastUnmountAt) : current.lastRemountDurationMs,
        },
    };
}

export function finishMapRemove(session, now = Date.now()) {
    const current = session ?? createMapLifecycleSession();
    if (current.liveInstances <= 0) return current;
    return {
        ...current,
        liveInstances: current.liveInstances - 1,
        removeCount: current.removeCount + 1,
        lastUnmountAt: now,
    };
}

export function noteCameraRestore(session, result) {
    const current = session ?? createMapLifecycleSession();
    return { ...current, cameraRestore: result };
}

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

/** Records a failed `map.remove()` on the isolation log. A normal teardown does not call this. */
export function recordMapRemoveFailure(message) {
    return logIsolationEvent({
        kind: ISOLATION_EVENT_KINDS.MAP_LIFECYCLE,
        message: `map-remove-failed:${message || 'map-remove-failed'}`,
        source: 'VenueMap',
    });
}

let activeSession = createMapLifecycleSession();
let rememberedCamera = null;

export function resetMapLifecycleTracking() {
    activeSession = createMapLifecycleSession();
    rememberedCamera = null;
    return getMapLifecycleSnapshot();
}

export function getMapLifecycleSnapshot() {
    return { ...activeSession, hasCamera: rememberedCamera != null };
}

export function trackMapMount(now = Date.now()) {
    const next = beginMapMount(activeSession, now);
    activeSession = next.session;
    return next.create;
}

export function trackMapRemove(camera, now = Date.now()) {
    if (camera) rememberedCamera = camera;
    activeSession = finishMapRemove(activeSession, now);
    return getMapLifecycleSnapshot();
}

export function cameraForRemount() {
    if (activeSession.mountCount < 2) return null;
    return rememberedCamera;
}

export function trackCameraRestore(result) {
    activeSession = noteCameraRestore(activeSession, result);
    return result;
}
