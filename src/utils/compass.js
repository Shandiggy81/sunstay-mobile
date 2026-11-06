// Compass helpers shared by the sun-position and wind panels.

const POINTS = [
    ['N', 'north'], ['NNE', 'north-north-east'], ['NE', 'north-east'], ['ENE', 'east-north-east'],
    ['E', 'east'], ['ESE', 'east-south-east'], ['SE', 'south-east'], ['SSE', 'south-south-east'],
    ['S', 'south'], ['SSW', 'south-south-west'], ['SW', 'south-west'], ['WSW', 'west-south-west'],
    ['W', 'west'], ['WNW', 'west-north-west'], ['NW', 'north-west'], ['NNW', 'north-north-west'],
];

/** Wrap any finite angle into [0, 360). Returns null for non-finite input. */
export function normalizeBearing(deg) {
    // Number(null) and Number('') are 0 — treat them as missing, not north.
    if (deg === null || deg === undefined || deg === '') return null;
    const n = Number(deg);
    if (!Number.isFinite(n)) return null;
    return ((n % 360) + 360) % 360;
}

/**
 * SunCalc measures azimuth from SOUTH, increasing towards west.
 * Convert to a normal compass bearing (0 = north, 90 = east).
 */
export function sunCalcAzimuthToBearing(sunCalcAzimuthDeg) {
    const n = Number(sunCalcAzimuthDeg);
    if (!Number.isFinite(n)) return null;
    return normalizeBearing(n + 180);
}

/** 16-point compass name for a bearing, e.g. { short: 'WSW', long: 'west-south-west' }. */
export function cardinal(deg) {
    const b = normalizeBearing(deg);
    if (b === null) return null;
    const [short, long] = POINTS[Math.round(b / 22.5) % 16];
    return { short, long };
}
