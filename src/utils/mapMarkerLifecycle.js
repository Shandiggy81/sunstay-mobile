/**
 * Generation-scoped HTML markers. A resumed Mapbox instance must not reuse
 * Marker objects, DOM nodes, or camera listeners from the torn-down map.
 * `mapboxgl.Marker` owns positioning; this module only decides which
 * generation may create, update, or release a marker.
 */

const MELBOURNE_BOUNDS = { minLng: 144.5, minLat: -38.2, maxLng: 145.5, maxLat: -37.5 };

function readAxis(value) {
    if (value == null || value === '') return { ok: false, reason: 'missing' };
    if (typeof value === 'boolean') return { ok: false, reason: 'missing' };
    const number = Number(value);
    if (!Number.isFinite(number)) return { ok: false, reason: 'non-finite' };
    return { ok: true, value: number };
}

/**
 * Mapbox order is [longitude, latitude]. Blank values are not numbers:
 * Number(null) and Number('') are 0, which would pin the venue in the ocean.
 * Out-of-range values are rejected, not swapped or clamped.
 */
export function markerCoordinatePlan(venue) {
    const id = venue?.id ?? '';
    const longitude = readAxis(venue?.lng);
    const latitude = readAxis(venue?.lat);
    if (!longitude.ok || !latitude.ok) {
        return {
            ok: false,
            id,
            reason: !longitude.ok ? longitude.reason : latitude.reason,
            longitude: venue?.lng ?? null,
            latitude: venue?.lat ?? null,
            swapped: false,
            region: 'rejected',
        };
    }
    const swapped = (
        (latitude.value > 90 || latitude.value < -90)
        && longitude.value >= -90
        && longitude.value <= 90
        && latitude.value >= -180
        && latitude.value <= 180
    );
    if (
        swapped
        || latitude.value > 90
        || latitude.value < -90
        || longitude.value > 180
        || longitude.value < -180
    ) {
        return {
            ok: false,
            id,
            reason: swapped ? 'swapped' : 'out-of-range',
            longitude: longitude.value,
            latitude: latitude.value,
            swapped,
            region: 'rejected',
        };
    }
    const inMelbourne = longitude.value >= MELBOURNE_BOUNDS.minLng
        && longitude.value <= MELBOURNE_BOUNDS.maxLng
        && latitude.value >= MELBOURNE_BOUNDS.minLat
        && latitude.value <= MELBOURNE_BOUNDS.maxLat;
    return {
        ok: true,
        id,
        reason: 'ok',
        longitude: longitude.value,
        latitude: latitude.value,
        swapped: false,
        region: inMelbourne ? 'melbourne' : 'outside-melbourne',
        coordinates: [longitude.value, latitude.value],
    };
}

/** Closing a venue does not mount a map. Expanded-sheet unmount is a separate flag. */
export function venueCloseMapTransition({
    mapboxEnabled = true,
    lifecycle = 'keep',
    sheetState = 'peek',
    hadMap = true,
} = {}) {
    const sheetExpanded = sheetState === 'expanded';
    const mapMounted = mapboxEnabled && (lifecycle !== 'unmount-expanded' || !sheetExpanded);
    return {
        sheetState,
        selectedVenue: null,
        mapMounted,
        remounts: false,
        createsMap: hadMap ? false : mapMounted,
        resizesExistingMap: hadMap && mapMounted,
    };
}

const sessionDiagnostics = {
    sheetCloses: 0,
    contextLosses: 0,
    resumeAttempts: 0,
    generation: 0,
    lastTransition: '',
    lastMarkerGeneration: '',
    lastInvalidCoordinate: '',
};

export function resetMapSessionDiagnostics() {
    sessionDiagnostics.sheetCloses = 0;
    sessionDiagnostics.contextLosses = 0;
    sessionDiagnostics.resumeAttempts = 0;
    sessionDiagnostics.generation = 0;
    sessionDiagnostics.lastTransition = '';
    sessionDiagnostics.lastMarkerGeneration = '';
    sessionDiagnostics.lastInvalidCoordinate = '';
    return getMapSessionDiagnostics();
}

export function noteSheetClose() {
    sessionDiagnostics.sheetCloses += 1;
    sessionDiagnostics.lastTransition = 'venue-close';
    return getMapSessionDiagnostics();
}

export function noteMapGeneration(generation) {
    sessionDiagnostics.generation = generation ?? 0;
    sessionDiagnostics.lastMarkerGeneration = String(generation ?? '');
    return getMapSessionDiagnostics();
}

export function noteContextLossDiagnostic(state = {}) {
    sessionDiagnostics.contextLosses = state.contextLosses ?? sessionDiagnostics.contextLosses + 1;
    sessionDiagnostics.resumeAttempts = state.resumeAttempts ?? sessionDiagnostics.resumeAttempts;
    sessionDiagnostics.generation = state.generation ?? sessionDiagnostics.generation;
    sessionDiagnostics.lastTransition = state.sessionLocked ? 'session-locked' : 'context-loss';
    return getMapSessionDiagnostics();
}

export function noteInvalidCoordinate(plan) {
    if (!plan || plan.ok) return getMapSessionDiagnostics();
    sessionDiagnostics.lastInvalidCoordinate = `${plan.id}:${plan.reason}`;
    sessionDiagnostics.lastTransition = 'invalid-coordinate';
    return getMapSessionDiagnostics();
}

export function getMapSessionDiagnostics() {
    return { ...sessionDiagnostics };
}

export function markerBelongsTo(record, generation) {
    return !!record && record.released !== true && record.generation === generation;
}

export function syncMarkerLayer(previous, generation, specs) {
    const prior = previous ?? {};
    const next = {};
    const created = [];
    const reused = [];
    const removed = [];
    const seen = new Set();

    for (const spec of specs) {
        if (seen.has(spec.id)) continue;
        seen.add(spec.id);
        const existing = prior[spec.id];
        if (markerBelongsTo(existing, generation)) {
            spec.update?.(existing);
            next[spec.id] = existing;
            reused.push(spec.id);
            continue;
        }
        if (existing && releaseMarkerRecord(existing)) removed.push(spec.id);
        const record = spec.create();
        record.generation = generation;
        record.released = false;
        next[spec.id] = record;
        created.push(spec.id);
    }

    for (const id of Object.keys(prior)) {
        if (next[id]) continue;
        if (releaseMarkerRecord(prior[id])) removed.push(id);
    }

    return { markers: next, created, reused, removed, generation };
}

export function releaseMarkerRecord(record) {
    if (!record || record.released) return false;
    record.released = true;
    try {
        record.marker?.remove?.();
    } catch {
        // A context-lost marker can throw; the DOM node is still detached below.
    }
    const element = record.element ?? record.el ?? record.marker?.getElement?.();
    if (element?.parentNode) element.remove();
    return true;
}

export function releaseMarkerRecords(records) {
    const list = Array.isArray(records) ? records : Object.values(records || {});
    let removed = 0;
    for (const record of list) {
        if (releaseMarkerRecord(record)) removed += 1;
    }
    return removed;
}

export function applyMarkerGesture(record, generation, coords) {
    if (!markerBelongsTo(record, generation)) return false;
    record.marker?.setLngLat?.(coords);
    return true;
}

/**
 * Camera/projection listeners for one map generation.
 * A second unbind is a no-op. Events whose generation is no longer current
 * do not call the handler.
 */
export function bindMapGestureListeners(map, generation, getGeneration, handler, types = ['move', 'moveend', 'idle']) {
    const entries = types.map((type) => {
        const listener = () => {
            if (getGeneration() !== generation) return;
            handler(type, generation);
        };
        map.on(type, listener);
        return { type, listener };
    });
    let removed = false;
    return function unbindMapGestureListeners() {
        if (removed) return false;
        removed = true;
        for (const entry of entries) map.off(entry.type, entry.listener);
        return true;
    };
}

/**
 * Marker sync must not wait for the basemap `idle` event. That event waits
 * for style tiles. The GeoJSON cluster source can be read as soon as it loads.
 */
export function markerSyncDecision({ sourceLoaded = false } = {}) {
    if (!sourceLoaded) return { sync: false, reason: 'source-not-loaded' };
    return { sync: true, reason: 'source-ready' };
}

/**
 * Required recovery is the cluster/venue marker set. An empty read while
 * venues exist is not synchronization. Optional groups never gate this.
 */
export function requiredMarkerGate({
    sourceLoaded = false,
    featureCount = 0,
} = {}) {
    if (!sourceLoaded) return { ready: false, reason: 'source-not-loaded' };
    if (featureCount === 0) return { ready: true, reason: 'markers-cleared' };
    return { ready: true, reason: 'markers-synced' };
}

/** Drop an in-flight sync frame so a canceled animation frame cannot lock the scheduler. */
export function releaseMarkerSyncFrame(scheduler) {
    const current = scheduler ?? createSyncScheduler();
    if (!current.frame) return current;
    return { ...current, frame: false };
}

export function resumeMayGoLive({ requiredMarkersReady = false } = {}) {
    return requiredMarkersReady === true;
}

export function createSyncScheduler() {
    return {
        generation: null,
        frame: false,
        passes: 0,
        coalesced: 0,
        ignored: 0,
        created: 0,
        reused: 0,
        removed: 0,
        clusterCreated: 0,
        venueCreated: 0,
        sourceWaits: 0,
        listeners: 0,
        cleanups: 0,
    };
}

export function noteMarkerListeners(scheduler, count) {
    const current = scheduler ?? createSyncScheduler();
    if (current.listeners > 0) return current;
    return { ...current, listeners: count };
}

export function noteMarkerCleanup(scheduler, count) {
    const current = scheduler ?? createSyncScheduler();
    return { ...current, cleanups: current.cleanups + count };
}

export function noteSourceWait(scheduler) {
    const current = scheduler ?? createSyncScheduler();
    return { ...current, frame: false, sourceWaits: current.sourceWaits + 1 };
}

export function requestMarkerSync(scheduler, generation) {
    const current = scheduler ?? createSyncScheduler();
    if (current.frame && current.generation !== generation) {
        return { scheduler: { ...current, ignored: current.ignored + 1 }, run: false };
    }
    if (current.frame) {
        return { scheduler: { ...current, coalesced: current.coalesced + 1 }, run: false };
    }
    return { scheduler: { ...current, generation, frame: true }, run: true };
}

export function completeMarkerSync(scheduler, {
    created = 0,
    reused = 0,
    removed = 0,
    clusterCreated = 0,
    venueCreated = 0,
} = {}) {
    const current = scheduler ?? createSyncScheduler();
    return {
        ...current,
        frame: false,
        passes: current.passes + 1,
        created: current.created + created,
        reused: current.reused + reused,
        removed: current.removed + removed,
        clusterCreated: current.clusterCreated + clusterCreated,
        venueCreated: current.venueCreated + venueCreated,
        cleanups: current.cleanups + removed,
    };
}

let markerSyncStats = createSyncScheduler();

export function resetMarkerSyncStats() {
    markerSyncStats = createSyncScheduler();
    return markerSyncStats;
}

export function getMarkerSyncStats() {
    return markerSyncStats;
}

export function publishMarkerSync(scheduler) {
    markerSyncStats = scheduler ?? createSyncScheduler();
    return markerSyncStats;
}

export function featuresForMarkerSync(map, sourceId) {
    if (!map || typeof map.querySourceFeatures !== 'function') return [];
    try {
        return map.querySourceFeatures(sourceId) || [];
    } catch {
        return [];
    }
}
