/**
 * Room sun profiles from real building geometry: a stay's own building (all of
 * its parts) plus the neighbouring buildings that can shade it. Pure; the
 * geometry comes from scripts/buildRoomProfiles.mjs.
 */
import { calculateFacadeSun } from './facadeSun.js';

export const ROOM_PROFILE_SOURCE = 'estimated-buildings';

const SOURCE_LABELS = {
    'estimated-buildings': 'Estimated from City of Melbourne building data',
    estimated: 'Estimated from building shape',
    'venue-verified': 'Verified by venue',
};
/** Any room whose sun is modelled rather than confirmed by the venue. */
export const isEstimatedRoom = room => String(room?.source ?? '').startsWith('estimated');
/** Plain-English note for where a room's sun profile comes from (null when unknown). */
export const roomSourceLabel = room => SOURCE_LABELS[room?.source] ?? null;
const STOREY_M = 3.2;
const DIRECTIONS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
const compass = value => ((value % 360) + 360) % 360;

/** Eight-point direction name for a facade bearing. */
export function directionName(bearing) {
    return DIRECTIONS[Math.round(compass(bearing) / 45) % 8];
}

/** Representative room level: about 60% of the building's height, at least level 2. */
export function representativeLevel(topMetres) {
    if (!Number.isFinite(topMetres) || topMetres <= 0) throw new RangeError('Building height must be positive');
    const highestLevel = Math.max(1, Math.floor((topMetres - STOREY_M) / STOREY_M));
    return Math.min(highestLevel, Math.max(2, Math.round((topMetres * 0.6) / STOREY_M)));
}

function maxAltitudeInBin(obstructions, from, to) {
    let max = 0;
    for (const range of obstructions) {
        const start = compass(range.start), end = compass(range.end);
        const all = Math.abs(range.end - range.start) >= 360;
        // A range overlaps the bin if any part of [from, to) lies inside it (ranges run clockwise, may wrap).
        const inside = b => all || (start <= end ? b >= start && b <= end : b >= start || b <= end);
        const overlaps = inside(from) || inside(to - 1e-9) || (start <= end ? start >= from && start < to : (start >= from && start < to) || (end >= from && end < to));
        if (overlaps && range.minAltitude > max) max = range.minAltitude;
    }
    return max;
}

/**
 * Shrinks a detailed horizon into a few ranges for the app bundle. Conservative:
 * each bin takes the HIGHEST horizon overlapping it, rounded up, so the result
 * never shows more sun than the detailed horizon.
 */
export function compressObstructions(obstructions, { binDegrees = 3, altitudeStep = 1 } = {}) {
    if (!Array.isArray(obstructions) || !obstructions.length) return [];
    const bins = [];
    for (let from = 0; from < 360; from += binDegrees) {
        const altitude = maxAltitudeInBin(obstructions, from, Math.min(360, from + binDegrees));
        bins.push(altitude > 0 ? Math.ceil(altitude / altitudeStep) * altitudeStep : 0);
    }
    const ranges = [];
    for (let i = 0; i < bins.length; i++) {
        if (!bins[i]) continue;
        const last = ranges.at(-1);
        if (last && last.minAltitude === bins[i] && last.endBin === i - 1) last.endBin = i;
        else ranges.push({ startBin: i, endBin: i, minAltitude: bins[i] });
    }
    // Join a range ending at 360 with one starting at 0 (wrap through north).
    if (ranges.length > 1 && ranges[0].startBin === 0 && ranges.at(-1).endBin === bins.length - 1 && ranges[0].minAltitude === ranges.at(-1).minAltitude) {
        const first = ranges.shift();
        ranges.at(-1).endBin = bins.length + first.endBin;
    }
    return ranges.map(r => {
        const rawEnd = (r.endBin + 1) * binDegrees;
        return {
            start: (r.startBin * binDegrees) % 360,
            // Past 360 means the range wrapped through north; exactly 360 stays 360 (not 0).
            end: rawEnd > 360 ? rawEnd - 360 : rawEnd,
            minAltitude: r.minAltitude,
        };
    });
}

/** Highest horizon within ±halfWidth degrees of a bearing. */
export function horizonAround(obstructions, bearing, halfWidth = 10) {
    let max = 0;
    for (let offset = -halfWidth; offset <= halfWidth; offset += 1) {
        const b = compass(bearing + offset);
        for (const range of obstructions ?? []) {
            const start = compass(range.start), end = compass(range.end);
            const covers = Math.abs(range.end - range.start) >= 360 || (start <= end ? b >= start && b <= end : b >= start || b <= end);
            if (covers && range.minAltitude > max) max = range.minAltitude;
        }
    }
    return max;
}

function rings(geometry) {
    const g = geometry?.type === 'Feature' ? geometry.geometry : geometry;
    if (g?.type === 'Polygon') return [g.coordinates];
    if (g?.type === 'MultiPolygon') return g.coordinates;
    return [];
}

/** Ray-casting point-in-polygon on lng/lat (holes respected). */
export function pointInGeometry([x, y], geometry) {
    return rings(geometry).some(polygon => polygon.reduce((inside, ring, ringIndex) => {
        let crossing = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) crossing = !crossing;
        }
        return ringIndex === 0 ? crossing : inside && !crossing;
    }, false));
}

/** A point `metres` in front of a wall midpoint, along the facade's outward bearing. */
function inFront([lng, lat], bearing, metres) {
    const rad = Math.PI / 180;
    return [lng + (metres * Math.sin(bearing * rad)) / (111320 * Math.cos(lat * rad)), lat + (metres * Math.cos(bearing * rad)) / 111132];
}

/**
 * A party wall is pressed against an adjoining building that rises above the
 * room: just in front of at least half of its wall midpoints there is a taller neighbour.
 * Such walls have no windows, so they are not offered as rooms.
 */
export function isPartyWall(facade, neighbours, { gapMetres = 1.5 } = {}) {
    const points = facade.wallMidpoints ?? [];
    if (!points.length) return false;
    const taller = neighbours.filter(n => (n.h ?? n.height_m) > facade.floorHeight);
    const blocked = points.filter(point => {
        const probe = inFront(point, facade.bearing, gapMetres);
        return taller.some(n => pointInGeometry(probe, n.g ?? n.footprint));
    }).length;
    return blocked / points.length >= 0.5;
}

/**
 * One room type per main facade (up to four, longest first, at least 12 m of wall),
 * at a representative level, shaded by the real neighbouring buildings. Party walls
 * are dropped, and each compass direction appears once (its longest wall).
 */
export function buildRoomProfiles({ venueId, own, top, neighbours }, { maxFacades = 4, minWallMetres = 12 } = {}) {
    const level = representativeLevel(top);
    const floorHeight = Math.round(level * STOREY_M * 10) / 10;
    const seen = new Set();
    const facades = calculateFacadeSun(own, neighbours.map(n => ({ footprint: n.g ?? n.footprint, height_m: n.h ?? n.height_m })), floorHeight)
        .filter(facade => facade.length >= minWallMetres)
        // Party walls: a taller neighbour just in front, or the wall itself inside one
        // (the horizon straight ahead is vertical; a tower across even a narrow
        // street stays below 89.5 degrees).
        .filter(facade => !isPartyWall(facade, neighbours) && horizonAround(facade.obstructions, facade.bearing) < 89.5)
        .sort((a, b) => b.length - a.length)
        .filter(facade => {
            const name = directionName(facade.bearing);
            if (seen.has(name)) return false;
            seen.add(name);
            return true;
        })
        .slice(0, maxFacades)
        .sort((a, b) => a.bearing - b.bearing);
    return facades.map((facade, index) => ({
        id: `${venueId}-facade-${index}`,
        name: `${directionName(facade.bearing)}-facing rooms · Level ${level}`,
        source: ROOM_PROFILE_SOURCE,
        orientation: Math.round(compass(facade.bearing) * 10) / 10,
        floorLevel: level,
        floorHeight,
        wallMetres: Math.round(facade.length),
        obstructions: compressObstructions(facade.obstructions),
    }));
}
