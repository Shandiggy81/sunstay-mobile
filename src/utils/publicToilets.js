import { finiteOrNull } from './finiteOrNull.js';

/**
 * Nearest accessible public toilet to a venue, from the National Public Toilet
 * Map (src/data/publicAccessibleToilets.json, built by
 * scripts/buildPublicToilets.mjs). Rows: [id, name, lat, lng, flags, hours].
 * flags: 1 key/MLAK, 2 Changing Places, 4 baby change, 8 payment.
 */
export const PUBLIC_TOILET_MAX_METRES = 500;
export const PUBLIC_TOILET_CREDIT = 'Public toilet from the National Public Toilet Map, Australian Government (CC BY 3.0 AU)';

function metresBetween(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @returns {null | { id: string, name: string, metres: number, keyRequired: boolean,
 *   changingPlaces: boolean, babyChange: boolean, paid: boolean, hours: string, url: string }}
 */
export function nearestAccessibleToilet(venue, rows, { maxMetres = PUBLIC_TOILET_MAX_METRES } = {}) {
    const lat = finiteOrNull(venue?.lat);
    const lng = finiteOrNull(venue?.lng);
    if (lat == null || lng == null || !Array.isArray(rows)) return null;
    // Cheap box first: 0.006° is about 500 m north–south at Melbourne's latitude.
    const pad = (maxMetres / 111000) * 1.2;
    let best = null;
    for (const row of rows) {
        const [, , tLat, tLng] = row;
        if (Math.abs(tLat - lat) > pad || Math.abs(tLng - lng) > pad * 1.3) continue;
        const metres = metresBetween(lat, lng, tLat, tLng);
        if (metres <= maxMetres && (!best || metres < best.metres)) best = { row, metres };
    }
    if (!best) return null;
    const [id, name, , , flags, hours] = best.row;
    return {
        id: String(id), name: String(name), metres: Math.round(best.metres),
        keyRequired: Boolean(flags & 1), changingPlaces: Boolean(flags & 2),
        babyChange: Boolean(flags & 4), paid: Boolean(flags & 8),
        hours: typeof hours === 'string' ? hours : '',
        url: `https://toiletmap.gov.au/facility/${encodeURIComponent(id)}`,
    };
}

/** "Accessible public toilet 120 m away · MLAK key" — walking-friendly rounding. */
export function publicToiletLine(toilet) {
    if (!toilet) return null;
    const m = toilet.metres < 50 ? Math.max(10, Math.round(toilet.metres / 10) * 10) : Math.round(toilet.metres / 50) * 50;
    const extras = [toilet.keyRequired && 'MLAK key', toilet.changingPlaces && 'Changing Places', toilet.paid && 'paid'].filter(Boolean);
    return `Accessible public toilet about ${m}\u00a0m away${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
}
