/**
 * GeoJSON for the map's two venue sources. The cluster source holds only what
 * clustering and pins need (id, position, sun-moment flags), so a changed
 * score never re-clusters every venue; scores go to the heatmap's own source.
 */

function point(venue) {
    return { type: 'Point', coordinates: [Number(venue.lng), Number(venue.lat)] };
}

/**
 * @param {object[]} venues
 * @param {(id: string) => object} momentPropsFor sun-moment flags for a venue id
 */
export function clusterSourceFeatures(venues, momentPropsFor) {
    return (venues ?? []).map((venue) => ({
        type: 'Feature',
        geometry: point(venue),
        properties: { id: venue.id, ...(momentPropsFor?.(venue.id) ?? {}) },
    }));
}

/** Heatmap weight when a venue has no usable score. */
export const HEATMAP_DEFAULT_WEIGHT = 0.75;

/**
 * @param {object[]} venues
 * @param {(venue: object) => number|null|undefined} scoreFor 0–100 comfort score
 * @returns {{ type: 'FeatureCollection', features: object[] }} score as a 0–1 weight
 */
export function heatmapSourceData(venues, scoreFor) {
    return {
        type: 'FeatureCollection',
        features: (venues ?? []).map((venue) => {
            const raw = scoreFor?.(venue);
            const score = typeof raw === 'number' && Number.isFinite(raw)
                ? Math.min(Math.max(raw / 100, 0), 1)
                : HEATMAP_DEFAULT_WEIGHT;
            return { type: 'Feature', geometry: point(venue), properties: { id: venue.id, score } };
        }),
    };
}
