/**
 * Development-only synthetic venues for load testing (?stress=1000).
 *
 * Only imported through a dynamic import guarded by import.meta.env.DEV in
 * useVenues, so production builds never include this module.
 *
 * Venues are spread over the City of Melbourne CBD, mixed between cafes,
 * restaurants and bars, and about 60% carry a 36-sector building horizon
 * (sun_horizon_deg) so sun moments and chips have real work to do.
 * Deterministic: the same count always gives the same venues.
 */

const KINDS = Object.freeze([
    { typeCategory: 'Cafe', typeLabel: 'Cafe', emoji: '☕', tags: ['Coffee', 'Sunny'] },
    { typeCategory: 'Restaurant', typeLabel: 'Restaurant', emoji: '🍝', tags: ['Dining'] },
    { typeCategory: 'Bar', typeLabel: 'Bar', emoji: '🍸', tags: ['Cocktails', 'Sunny'] },
]);

export const STRESS_MAX = 5000;

/** Venue count from a query string, 0 when absent or invalid. */
export function stressCount(search) {
    try {
        const raw = new URLSearchParams(search ?? '').get('stress');
        const n = Math.floor(Number(raw));
        return Number.isFinite(n) && n > 0 ? Math.min(n, STRESS_MAX) : 0;
    } catch {
        return 0;
    }
}

/**
 * @param {number} count
 * @returns {object[]} venue records shaped like src/data/demoVenues.js
 */
export function stressVenues(count) {
    const n = Math.max(0, Math.min(STRESS_MAX, Math.floor(Number(count) || 0)));
    let seed = 20261015;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = [];
    for (let i = 0; i < n; i++) {
        const kind = KINDS[i % KINDS.length];
        const venue = {
            id: `stress-${i}`,
            venueName: `Stress ${kind.typeLabel} ${i + 1}`,
            suburb: 'CBD',
            address: `${1 + (i % 300)} Test Street, Melbourne VIC 3000`,
            lat: Number((-37.825 + rnd() * 0.02).toFixed(6)),
            lng: Number((144.95 + rnd() * 0.025).toFixed(6)),
            emoji: kind.emoji,
            typeCategory: kind.typeCategory,
            typeLabel: kind.typeLabel,
            vibe: kind.typeLabel,
            tags: kind.tags,
            sunshineScore: Math.round(rnd() * 100),
            shelterFactor: Number((0.2 + rnd() * 0.6).toFixed(2)),
            price: '$$',
            image: null,
            stress: true,
        };
        // null (not missing) tells useSunHorizons not to look this venue up.
        venue.sun_horizon_deg = rnd() < 0.6 ? Array.from({ length: 36 }, () => Math.round(rnd() * 70)) : null;
        out.push(venue);
    }
    return out;
}
