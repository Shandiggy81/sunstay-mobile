/**
 * City of Melbourne "2023 Building Footprints" → public.buildings rows.
 *
 * Source: https://discover.data.vic.gov.au/dataset/2023-building-footprints
 * Licence: CC BY 4.0. Show CITY_BUILDINGS_ATTRIBUTION wherever this data
 * informs what users see.
 *
 * Each feature is one component of a structure (e.g. a podium, or a tower
 * sitting on it). Elevations are metres AHD (sea level), so heights above the
 * ground are measured from structure_min_elevation, the base of the whole
 * structure. footprint_extrusion is only the component's own thickness and
 * must not be used as its height: a 6 m plant room on a 70 m tower has
 * footprint_extrusion 6 but its top is 70 m above the ground, and the top is
 * what casts the shadow.
 */

export const CITY_BUILDINGS_SOURCE = 'com2023';
export const CITY_BUILDINGS_ATTRIBUTION = 'Building data © City of Melbourne (CC BY 4.0)';

// Australia 108 (the tallest) is ~317 m; anything far above is bad data.
const MAX_HEIGHT_M = 400;
const MIN_HEIGHT_M = 0.5;

const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function validRing(ring) {
    return Array.isArray(ring) && ring.length >= 4 && ring.every(point =>
        Array.isArray(point) && point.length >= 2 &&
        finite(point[0]) !== null && finite(point[1]) !== null &&
        point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90);
}

function validGeometry(geometry) {
    if (!geometry) return false;
    if (geometry.type === 'Polygon') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(validRing);
    if (geometry.type === 'MultiPolygon') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 &&
        geometry.coordinates.every(polygon => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing));
    return false;
}

/**
 * Groups the components of one building (podium, tower, plant room...) so a
 * building never shades itself. Null when the source gives no structure id.
 */
export function structureRef(structureId) {
    const id = structureId === null || structureId === undefined ? '' : String(structureId).trim();
    return id ? `${CITY_BUILDINGS_SOURCE}:s${id}` : null;
}

/**
 * Returns { source_ref, structure_ref, geom_geojson, height_m, base_m } or null when the
 * feature should be skipped (not a building, bad geometry or bad heights).
 */
export function cityBuildingRow(feature) {
    const p = feature?.properties;
    if (!p || p.footprint_type !== 'Structure') return null;
    if (!validGeometry(feature.geometry)) return null;
    const ground = finite(p.structure_min_elevation);
    const top = finite(p.footprint_max_elevation);
    const bottom = finite(p.footprint_min_elevation);
    if (ground === null || top === null) return null;
    const height = top - ground;
    if (!(height >= MIN_HEIGHT_M && height <= MAX_HEIGHT_M)) return null;
    const base = bottom === null ? 0 : Math.min(Math.max(0, bottom - ground), height);
    const id = p.objectid ?? null;
    if (id === null || String(id).trim() === '') return null;
    return {
        source_ref: `${CITY_BUILDINGS_SOURCE}:${String(id).trim()}`,
        structure_ref: structureRef(p.structure_id),
        geom_geojson: JSON.stringify(feature.geometry),
        height_m: Math.round(height * 10) / 10,
        base_m: Math.round(base * 10) / 10,
    };
}

/** Converts a whole FeatureCollection and reports what was skipped and why. */
export function cityBuildingRows(collection) {
    const rows = [], skipped = { notStructure: 0, invalid: 0, duplicate: 0 };
    const seen = new Set();
    for (const feature of collection?.features ?? []) {
        if (feature?.properties?.footprint_type !== 'Structure') { skipped.notStructure++; continue; }
        const row = cityBuildingRow(feature);
        if (!row) { skipped.invalid++; continue; }
        if (seen.has(row.source_ref)) { skipped.duplicate++; continue; }
        seen.add(row.source_ref);
        rows.push(row);
    }
    return { rows, skipped };
}

export function chunk(rows, size) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('Chunk size must be a positive integer.');
    const batches = [];
    for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));
    return batches;
}

/** Compact [objectid, structureId] pairs for backfilling structure_ref on rows already loaded. */
export function structurePairs(collection) {
    const pairs = [], seen = new Set();
    for (const feature of collection?.features ?? []) {
        const row = cityBuildingRow(feature);
        if (!row || !row.structure_ref || seen.has(row.source_ref)) continue;
        seen.add(row.source_ref);
        pairs.push([row.source_ref.slice(CITY_BUILDINGS_SOURCE.length + 1), row.structure_ref.slice(CITY_BUILDINGS_SOURCE.length + 2)]);
    }
    return pairs;
}
