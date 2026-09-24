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
