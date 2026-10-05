/**
 * Opt-in Mapbox mount decision for the iOS crash matrix.
 * Default and `keep` leave the map mounted. `unmount-expanded` drops it
 * only while the list sheet is in the stable fully expanded state.
 * Drag offsets are ignored so a swipe cannot create a mount loop.
 *
 * `static-when-expanded` is a separate diagnostic. It does nothing unless
 * `matrixHud=1`. After the covering sheet stays expanded, and not while a
 * drag is active, it offloads the live map once and shows a static
 * placeholder. Closing that sheet and staying there restores one generation.
 */

import { ISOLATION_EVENT_KINDS, logIsolationEvent } from './iosCrashLog.js';

export const MAP_LIFECYCLE_KEEP = 'keep';
export const MAP_LIFECYCLE_UNMOUNT_EXPANDED = 'unmount-expanded';
export const MAP_LIFECYCLE_STATIC_WHEN_EXPANDED = 'static-when-expanded';
/** Inside the requested 250–400ms window after the last sheet-state change. */
export const MAP_OFFLOAD_SETTLE_MS = 320;

export function parseMapLifecycle(value) {
    if (value == null) return MAP_LIFECYCLE_KEEP;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '' || normalized === 'keep' || normalized === 'default') {
        return MAP_LIFECYCLE_KEEP;
    }
    if (normalized === 'unmount-expanded') return MAP_LIFECYCLE_UNMOUNT_EXPANDED;
    if (normalized === 'static-when-expanded') return MAP_LIFECYCLE_STATIC_WHEN_EXPANDED;
    return MAP_LIFECYCLE_KEEP;
}

export function shouldMountMap({
    mapboxEnabled = true,
    lifecycle = MAP_LIFECYCLE_KEEP,
    sheetExpanded = false,
    diagnostic = false,
    offloadCommitted = false,
} = {}) {
    if (!mapboxEnabled) return false;
    if (lifecycle === MAP_LIFECYCLE_UNMOUNT_EXPANDED) return sheetExpanded !== true;
    if (lifecycle === MAP_LIFECYCLE_STATIC_WHEN_EXPANDED) {
        if (diagnostic !== true) return true;
        return offloadCommitted !== true;
    }
    return true;
}

/** Camera is remembered for the existing unmount mode and the diagnostic static mode. */
export function mapLifecycleRemembersCamera(lifecycle, diagnostic = false) {
    if (lifecycle === MAP_LIFECYCLE_UNMOUNT_EXPANDED) return true;
    return lifecycle === MAP_LIFECYCLE_STATIC_WHEN_EXPANDED && diagnostic === true;
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

export function peekRememberedCamera() {
    return rememberedCamera;
}

function staticModeActive(input) {
    return input?.lifecycle === MAP_LIFECYCLE_STATIC_WHEN_EXPANDED
        && input?.diagnostic === true
        && input?.mapboxEnabled !== false;
}

function armRemaining(state, at) {
    if (state.deadline == null) return null;
    if (at == null) return MAP_OFFLOAD_SETTLE_MS;
    return Math.max(0, state.deadline - at);
}

export function createStaticOffloadState(overrides = {}) {
    return {
        phase: 'live',
        deadline: null,
        offloads: 0,
        removes: 0,
        restores: 0,
        generationsCreated: 0,
        liveInstances: 1,
        initLock: false,
        cameraSaves: 0,
        camera: null,
        cameraRestores: 0,
        markerSyncs: 0,
        skipped: 0,
        traces: [],
        placeholder: false,
        activeGeneration: 1,
        readyGeneration: null,
        markersGeneration: null,
        restoreFailed: false,
        ...overrides,
    };
}

let offloadSnapshot = createStaticOffloadState();

export function publishStaticOffload(state) {
    offloadSnapshot = state ?? createStaticOffloadState();
    return getStaticOffloadSnapshot();
}

export function getStaticOffloadSnapshot() {
    return { ...offloadSnapshot, traces: offloadSnapshot.traces.slice() };
}

export function resetStaticOffloadTracking() {
    offloadSnapshot = createStaticOffloadState();
    return getStaticOffloadSnapshot();
}

/**
 * Marker sync for a restored generation waits until that generation's map
 * is ready. A callback from an older generation does not move markers.
 */
export function markerSyncAfterRestore({
    mapReady = false,
    generation = 0,
    currentGeneration = 0,
    offloaded = false,
} = {}) {
    if (offloaded) return { sync: false, reason: 'offloaded' };
    if (!mapReady) return { sync: false, reason: 'map-not-ready' };
    if (generation !== currentGeneration) return { sync: false, reason: 'stale' };
    return { sync: true, reason: 'generation-ready' };
}

function traced(state, names) {
    if (!names.length) return state;
    return { ...state, traces: [...state.traces, ...names] };
}

function finish(state, names, armMs = null) {
    return { state: traced(state, names), traces: names, armMs };
}

/**
 * Diagnostic offload gate. Sun Forecast is not an input that changes phase.
 * Sheet samples coalesce: a second expanded sample while arming does not
 * request another teardown, and a second settle does not remove again.
 */
export function reduceStaticOffload(state, input = {}) {
    const current = state ?? createStaticOffloadState();
    const type = input.type || 'sample';
    if (type === 'sample' && !staticModeActive(input)) {
        return finish(current, []);
    }
    if (type !== 'sample' && input.lifecycle != null && !staticModeActive(input)) {
        return finish(current, []);
    }

    if (type === 'sample') {
        if (input.source === 'sun-forecast-open' || input.source === 'sun-forecast') {
            return finish(current, [], armRemaining(current, input.at));
        }
        const expanded = input.expanded === true;
        const dragging = input.dragging === true;
        if (dragging) {
            if (current.phase === 'offload-arming') {
                return finish({
                    ...current,
                    phase: 'live',
                    deadline: null,
                    skipped: current.skipped + 1,
                }, ['map-offload-skipped']);
            }
            if (current.phase === 'restore-arming') {
                return finish({ ...current, phase: 'offloaded', deadline: null, placeholder: true }, []);
            }
            return finish(current, []);
        }
        if (expanded) {
            if (current.phase === 'live') {
                return finish({
                    ...current,
                    phase: 'offload-arming',
                    deadline: (input.at ?? 0) + MAP_OFFLOAD_SETTLE_MS,
                }, ['map-offload-requested'], MAP_OFFLOAD_SETTLE_MS);
            }
            if (current.phase === 'offload-arming') {
                return finish(current, [], armRemaining(current, input.at));
            }
            if (current.phase === 'restore-arming') {
                return finish({ ...current, phase: 'offloaded', deadline: null, placeholder: true }, []);
            }
            return finish(current, []);
        }
        if (current.phase === 'restore-failed') return finish(current, []);
        if (current.phase === 'offloaded') {
            return finish({
                ...current,
                phase: 'restore-arming',
                deadline: (input.at ?? 0) + MAP_OFFLOAD_SETTLE_MS,
            }, ['map-restore-requested'], MAP_OFFLOAD_SETTLE_MS);
        }
        if (current.phase === 'restore-arming') {
            return finish(current, [], armRemaining(current, input.at));
        }
        if (current.phase === 'offload-arming') {
            return finish({
                ...current,
                phase: 'live',
                deadline: null,
                skipped: current.skipped + 1,
            }, ['map-offload-skipped']);
        }
        return finish(current, []);
    }

    if (type === 'settle') {
        if (current.phase !== 'offload-arming' && current.phase !== 'restore-arming') {
            return finish(current, []);
        }
        if (input.at != null && current.deadline != null && input.at < current.deadline) {
            return finish(current, [], current.deadline - input.at);
        }
        if (input.dragging === true) {
            const phase = current.phase === 'restore-arming' ? 'offloaded' : 'live';
            return finish({
                ...current,
                phase,
                deadline: null,
                placeholder: phase !== 'live',
                skipped: current.skipped + 1,
            }, ['map-offload-skipped']);
        }
        if (current.phase === 'offload-arming') {
            if (input.expanded === false) {
                return finish({
                    ...current,
                    phase: 'live',
                    deadline: null,
                    skipped: current.skipped + 1,
                }, ['map-offload-skipped']);
            }
            const camera = input.camera ?? current.camera;
            const saveCamera = camera != null && current.cameraSaves === 0;
            return finish({
                ...current,
                phase: 'offloaded',
                deadline: null,
                offloads: current.offloads + 1,
                placeholder: true,
                camera: saveCamera ? camera : current.camera,
                cameraSaves: saveCamera ? 1 : current.cameraSaves,
            }, ['map-offload-start']);
        }
        if (current.restoreFailed) return finish(current, []);
        const live = input.liveInstances != null ? input.liveInstances : current.liveInstances;
        const locked = input.initLock != null ? input.initLock : current.initLock;
        if (live > 0 || locked) {
            return finish({
                ...current,
                phase: 'offloaded',
                deadline: null,
                placeholder: true,
                skipped: current.skipped + 1,
            }, ['map-offload-skipped']);
        }
        return finish({
            ...current,
            phase: 'restoring',
            deadline: null,
            restores: current.restores + 1,
            generationsCreated: current.generationsCreated + 1,
            liveInstances: 1,
            initLock: true,
            activeGeneration: current.activeGeneration + 1,
            readyGeneration: null,
            markersGeneration: null,
            placeholder: true,
        }, ['map-restore-start']);
    }

    if (type === 'removed') {
        if (current.offloads > 0 && current.removes >= current.offloads && current.liveInstances === 0) {
            return finish(current, []);
        }
        if (current.phase !== 'offloaded' && current.phase !== 'restore-arming') {
            return finish(current, []);
        }
        const camera = input.camera ?? current.camera;
        const saveCamera = camera != null && current.cameraSaves === 0;
        return finish({
            ...current,
            removes: current.removes + 1,
            liveInstances: 0,
            initLock: false,
            placeholder: true,
            camera: saveCamera ? camera : current.camera,
            cameraSaves: saveCamera ? current.cameraSaves + 1 : current.cameraSaves,
        }, ['map-offload-complete']);
    }

    if (type === 'map-ready') {
        if (current.phase !== 'restoring') return finish(current, []);
        if (input.generation !== current.activeGeneration) return finish(current, []);
        return finish({
            ...current,
            readyGeneration: input.generation,
            initLock: false,
        }, []);
    }

    if (type === 'markers-ready') {
        const decision = markerSyncAfterRestore({
            mapReady: input.mapReady === true || current.readyGeneration === current.activeGeneration,
            generation: input.generation,
            currentGeneration: current.activeGeneration,
            offloaded: current.phase === 'offloaded' || current.phase === 'restore-arming',
        });
        if (!decision.sync || current.phase !== 'restoring') return finish(current, []);
        return finish({
            ...current,
            phase: 'live',
            placeholder: false,
            markersGeneration: input.generation,
            markerSyncs: current.markerSyncs + 1,
            liveInstances: 1,
            initLock: false,
            cameraRestores: current.camera ? current.cameraRestores + 1 : current.cameraRestores,
        }, ['map-restore-complete']);
    }

    if (type === 'restore-failed') {
        if (current.restoreFailed) return finish(current, []);
        const live = input.liveInstances != null ? input.liveInstances : current.liveInstances;
        return finish({
            ...current,
            phase: 'restore-failed',
            restoreFailed: true,
            deadline: null,
            placeholder: false,
            initLock: false,
            liveInstances: live,
        }, ['map-restore-failed']);
    }

    return finish(current, []);
}

export function staticOffloadHidesMap(phase) {
    return phase === 'offloaded' || phase === 'restore-arming';
}

export function staticOffloadShowsPlaceholder(phase) {
    return phase === 'offloaded' || phase === 'restore-arming' || phase === 'restoring';
}

/** Deliberate offload copy. WebGL recovery messages stay in mapRecovery.js. */
export const MAP_OFFLOAD_PLACEHOLDER_COPY = 'Map offloaded to save memory';

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
