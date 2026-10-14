import { finiteOrNull } from './finiteOrNull.js';

const clampFactor = value => Math.max(0, Math.min(2.5, value));
export function windFromDegrees(value) {
    const direction = finiteOrNull(value);
    return direction !== null && direction >= 0 && direction <= 360 ? direction % 360 : null;
}

export function matchesWindSector(direction, sector) {
    const from = finiteOrNull(sector?.from), to = finiteOrNull(sector?.to);
    if (direction === null || from === null || to === null || from < 0 || from > 360 || to < 0 || to > 360) return false;
    if (Math.abs(to - from) === 360) return true;
    const start = from % 360, end = to % 360;
    // Clockwise, inclusive endpoints. First matching sector wins if sectors overlap.
    return start < end ? direction >= start && direction <= end : start > end && (direction >= start || direction <= end);
}

/** All speeds are m/s. Callers supply the existing getWindProfile exposure as
 * fallbackFactor, keeping the helper independent of venue-type heuristics.
 */
export function calculateWindExposure({ windMs, gustMs, direction, windProfile, fallbackFactor = 1 }) {
    const from = windFromDegrees(direction);
    const fallback = finiteOrNull(fallbackFactor) ?? 1;
    let factor = fallback, note = null, directional = false;
    if (windProfile && from !== null) {
        const sectors = Array.isArray(windProfile.sectors) ? windProfile.sectors : [];
        const sector = sectors.find(s => finiteOrNull(s?.factor) !== null && matchesWindSector(from, s));
        const configured = finiteOrNull(sector?.factor) ?? finiteOrNull(windProfile.defaultFactor);
        if (configured !== null) {
            factor = configured; directional = true;
            note = typeof sector?.note === 'string' ? sector.note : null;
        }
    }
    factor = clampFactor(factor);
    const wind = finiteOrNull(windMs), gust = finiteOrNull(gustMs);
    return {
        factor, direction: from, directional, note, tunnel: directional && factor > 1,
        effectiveWindMs: wind === null || wind < 0 ? null : wind * factor,
        effectiveGustMs: gust === null || gust < 0 ? null : gust * factor,
    };
}

export function describeWindExposure(exposure, timeLabel = 'today') {
    if (exposure.effectiveWindMs === null && exposure.effectiveGustMs === null) return 'Wind estimate unavailable';
    const names = ['northerly', 'north-easterly', 'easterly', 'south-easterly', 'southerly', 'south-westerly', 'westerly', 'north-westerly'];
    const direction = exposure.direction === null ? '' : `${names[Math.round(exposure.direction / 45) % 8]} `;
    if (exposure.tunnel) {
        const speed = exposure.effectiveGustMs ?? exposure.effectiveWindMs;
        return `Wind tunnel warning ${timeLabel}: ${direction}${exposure.effectiveGustMs === null ? 'winds' : 'gusts'} feel like ${Math.round(speed * 3.6)} km/h here`;
    }
    if (exposure.directional) return `${exposure.factor < 1 ? 'Sheltered' : 'Exposed'} ${timeLabel} — ${direction}breeze`;
    return `Wind around ${Math.round((exposure.effectiveWindMs ?? exposure.effectiveGustMs) * 3.6)} km/h here`;
}
