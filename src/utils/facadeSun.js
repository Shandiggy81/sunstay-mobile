import { finiteOrNull } from './finiteOrNull.js';

const RAD = Math.PI / 180, EARTH_RADIUS = 6371008.8;
const compass = value => (value % 360 + 360) % 360;
const difference = (a, b) => ((a - b + 540) % 360) - 180;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const bearingOf = vector => compass(Math.atan2(vector[0], vector[1]) / RAD);
const distance = point => Math.hypot(...point);

function polygonRings(input) {
    const geometry = input?.type === 'Feature' ? input.geometry : input;
    if (geometry?.type === 'Polygon') return [geometry.coordinates];
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
    throw new TypeError('A Polygon or MultiPolygon GeoJSON footprint is required');
}

function projection(origin) {
    const [lng, lat] = origin;
    const scale = EARTH_RADIUS * RAD, cosLat = Math.cos(lat * RAD);
    if (Math.abs(cosLat) < 1e-6) throw new RangeError('Footprint is too close to a pole');
    return {
        project: point => {
            if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
                || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new TypeError('Invalid lng/lat footprint coordinate');
            return [difference(point[0], lng) * scale * cosLat, (point[1] - lat) * scale];
        },
        unproject: point => [((lng + point[0] / (scale * cosLat) + 540) % 360) - 180, lat + point[1] / scale],
    };
}

function closedRing(ring, project) {
    if (!Array.isArray(ring) || ring.length < 3) throw new TypeError('Footprint ring needs at least three vertices');
    const points = ring.map(project);
    if (distance([points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]]) > 1e-6) points.push(points[0]);
    return points;
}

function edgesOf(ring) {
    return ring.slice(0, -1).map((point, index) => [point, ring[index + 1]]);
}

function containsOrigin(ring) {
    let inside = false;
    for (const [a, b] of edgesOf(ring)) {
        if ((a[1] > 0) !== (b[1] > 0) && 0 < a[0] + (b[0] - a[0]) * -a[1] / (b[1] - a[1])) inside = !inside;
    }
    return inside;
}

function rayDistance(ring, degrees) {
    const ray = [Math.sin(degrees * RAD), Math.cos(degrees * RAD)];
    let nearest = Infinity;
    for (const [a, b] of edgesOf(ring)) {
        const edge = [b[0] - a[0], b[1] - a[1]], denominator = cross(ray, edge);
        if (Math.abs(denominator) < 1e-9) continue;
        const t = cross(a, edge) / denominator, u = cross(a, ray) / denominator;
        if (t >= -1e-6 && u >= -1e-8 && u <= 1 + 1e-8) nearest = Math.min(nearest, Math.max(0, t));
    }
    return nearest;
}

/** Vertex/nearest-edge rays capture even neighbours narrower than one angular bin. */
function criticalBearings(ring) {
    return edgesOf(ring).flatMap(([a, b]) => {
        const edge = [b[0] - a[0], b[1] - a[1]], squared = edge[0] ** 2 + edge[1] ** 2;
        const t = squared ? Math.max(0, Math.min(1, -(a[0] * edge[0] + a[1] * edge[1]) / squared)) : 0;
        return [bearingOf(a), bearingOf([a[0] + t * edge[0], a[1] + t * edge[1]])];
    });
}

function horizonFor(walls, bearing, neighbours, floorHeight) {
    const bins = new Array(180).fill(0), viewStart = bearing - 90;
    for (const wall of walls) for (const neighbour of neighbours) {
        const relative = neighbour.ring.map(p => [p[0] - wall.midpoint[0], p[1] - wall.midpoint[1]]);
        const critical = criticalBearings(relative).map(b => difference(b, bearing) + 90);
        const inside = containsOrigin(relative);
        for (let index = 0; index < bins.length; index++) {
            const angles = [index, index + 0.5, index + 1, ...critical.filter(b => b >= index && b <= index + 1)];
            const nearest = inside ? 0 : Math.min(...angles.map(b => rayDistance(relative, viewStart + b)));
            if (!Number.isFinite(nearest)) continue;
            const altitude = Math.atan2(neighbour.height - floorHeight, nearest) / RAD;
            // Round upward for a conservative, 1-degree / 0.1-degree horizon estimate.
            bins[index] = Math.max(bins[index], Math.ceil(altitude * 10) / 10);
        }
    }
    const ranges = [];
    for (let index = 0; index < bins.length;) {
        const altitude = bins[index], from = index++;
        while (index < bins.length && bins[index] === altitude) index++;
        if (altitude > 0) ranges.push({ start: compass(viewStart + from), end: compass(viewStart + index), minAltitude: altitude });
    }
    return ranges;
}

/**
 * Pure, local-distance facade estimate for nearby buildings, not a survey.
 * floorHeight is metres above the shared ground datum, NOT a floor number.
 * Neighbours: { footprint: GeoJSON Polygon/MultiPolygon, height_m: metres }
 * (GeoJSON Features may instead carry properties.height_m).
 * Horizons are seen from wall midpoints; merged walls use the highest horizon.
 * Exterior rings only; no terrain, roof/overhang or courtyard-wall inference.
 */
export function calculateFacadeSun(footprint, neighbours = [], floorHeight = 0) {
    const height = finiteOrNull(floorHeight);
    if (height === null || height < 0) throw new RangeError('Floor height must be non-negative metres');
    const polygons = polygonRings(footprint);
    const origin = polygons?.[0]?.[0]?.[0];
    if (!origin) throw new TypeError('Footprint is empty');
    const { project, unproject } = projection(origin);
    const walls = polygons.flatMap(polygon => {
        const ring = closedRing(polygon[0], project);
        const signedArea = edgesOf(ring).reduce((sum, [a, b]) => sum + cross(a, b), 0);
        if (Math.abs(signedArea) < 1e-6) throw new TypeError('Footprint has no area');
        return edgesOf(ring).flatMap(([a, b]) => {
            const [dx, dy] = [b[0] - a[0], b[1] - a[1]], length = Math.hypot(dx, dy);
            if (length < 4) return [];
            const normal = signedArea > 0 ? [dy, -dx] : [-dy, dx];
            return [{ bearing: bearingOf(normal), length, midpoint: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }];
        });
    }).sort((a, b) => b.length - a.length || a.bearing - b.bearing);
    const groups = [];
    for (const wall of walls) {
        // Compare every member, so a chain of shallow bends cannot merge opposing walls.
        const group = groups.find(g => g.every(w => Math.abs(difference(w.bearing, wall.bearing)) <= 15));
        if (group) group.push(wall); else groups.push([wall]);
    }
    const nearby = (neighbours ?? []).flatMap(neighbour => {
        const neighbourHeight = finiteOrNull(neighbour?.height_m ?? neighbour?.height ?? neighbour?.properties?.height_m);
        if (neighbourHeight === null || neighbourHeight <= height) return [];
        try {
            return polygonRings(neighbour.footprint ?? neighbour).map(polygon => ({
                height: neighbourHeight, ring: closedRing(polygon[0], project),
            }));
        } catch { return []; } // Unknown or malformed neighbouring footprints do not invent shade.
    });
    return groups.map(group => {
        const length = group.reduce((sum, wall) => sum + wall.length, 0);
        const normal = group.reduce((sum, wall) => [sum[0] + Math.sin(wall.bearing * RAD) * wall.length, sum[1] + Math.cos(wall.bearing * RAD) * wall.length], [0, 0]);
        const bearing = bearingOf(normal);
        return { bearing, length, floorHeight: height,
            wallMidpoints: group.map(wall => unproject(wall.midpoint)),
            obstructions: horizonFor(group, bearing, nearby, height) };
    }).sort((a, b) => a.bearing - b.bearing);
}

const DIRECTION_NAMES = ['North', 'North-northeast', 'Northeast', 'East-northeast', 'East', 'East-southeast', 'Southeast', 'South-southeast', 'South', 'South-southwest', 'Southwest', 'West-southwest', 'West', 'West-northwest', 'Northwest', 'North-northwest'];

/** One estimated type per main facade, at the highest supplied representative level.
 * Calculate the input facade horizons at that level's measured height first.
 * Room types make no claim about actual room inventory or balcony/outdoor access.
 */
export function estimateRoomTypesFromFacades(facades, floors = 0) {
    const levels = (Array.isArray(floors) ? floors : [floors]).map(finiteOrNull).filter(level => Number.isInteger(level) && level >= 0);
    if (!levels.length) throw new RangeError('Supply a non-negative representative floor level');
    const floorLevel = Math.max(...levels);
    return facades.filter(facade => Number.isFinite(facade.bearing) && facade.length >= 4).map((facade, index) => {
        const orientation = compass(facade.bearing), name = DIRECTION_NAMES[Math.round(orientation / 22.5) % 16];
        return { id: `facade-${index}-${floorLevel}`, name: `City side · ${name}-facing · Level ${floorLevel}`,
            source: 'estimated', orientation, floorLevel, floorHeight: facade.floorHeight,
            obstructions: (facade.obstructions ?? []).map(range => ({ ...range })) };
    });
}
