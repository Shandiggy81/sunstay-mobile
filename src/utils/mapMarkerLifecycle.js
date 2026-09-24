/**
 * Generation-scoped HTML markers. A resumed Mapbox instance must not reuse
 * Marker objects, DOM nodes, or camera listeners from the torn-down map.
 * `mapboxgl.Marker` owns positioning; this module only decides which
 * generation may create, update, or release a marker.
 */

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
    venueCount = 0,
} = {}) {
    if (!sourceLoaded) return { ready: false, reason: 'source-not-loaded' };
    if (venueCount > 0 && featureCount === 0) return { ready: false, reason: 'features-missing' };
    return { ready: true, reason: 'markers-synced' };
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
