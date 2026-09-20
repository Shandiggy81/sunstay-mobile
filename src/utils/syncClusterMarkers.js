/**
 * Keep cluster DOM markers glued to Mapbox cluster centroids after pan/zoom.
 * Position is written before count so a stale pin cannot linger at the old lng/lat.
 */

export function syncExistingClusterMarker(existing, coords, count, { updateCount } = {}) {
    existing.marker?.setLngLat(coords);
    if (existing.count !== count) {
        updateCount?.(existing, count);
        existing.count = count;
    }
    return existing;
}

export function removeStaleMarkers(prev, next) {
    const removed = [];
    for (const id of Object.keys(prev)) {
        if (!next[id]) {
            prev[id].marker?.remove();
            removed.push(id);
        }
    }
    return removed;
}
