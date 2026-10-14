/**
 * Direct-sun score for venues with no microclimate profile row.
 *
 * The cached profile score is `effective_sun × 100`, where the edge job sets
 * `effective_sun = sun_hour_fraction[hour] × (1 − cloud_cover / 100)`. This
 * mirrors that formula with what the client knows without a profile: sun
 * height stands in for the geometric fraction, venue exposure for the
 * surveyed shading, and the forecast cloud cover is applied the same way.
 * So a "Sun score" means "how much direct sun is on the seats" whichever
 * source produced it, and a list sorted by it compares like with like.
 *
 * Comfort (temperature, wind, rain) is deliberately not in this number; that
 * is `calculateSunstayScore`.
 *
 * @module utils/directSunScore
 */

// Below this height the sun is mostly behind low-rise surroundings, so it
// ramps from 0 at the horizon to full at this altitude. Matches the
// alignment cut-off calculateSunstayScore uses.
export const SUN_FULL_ALTITUDE_DEG = 12;

// The edge job assumes 50% cloud when it has no weather for a cell.
const UNKNOWN_CLOUD_PCT = 50;

const EXPOSURE_SUN_FACTOR = Object.freeze({
    OPEN: 1,
    PARTIAL: 0.6,
    COVERED: 0.25,
    INDOOR: 0,
});

const clamp01 = (n) => Math.min(1, Math.max(0, n));

const asFiniteNumber = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

/**
 * @param {object} input
 * @param {number|null} input.sunAltitudeDeg - degrees above the horizon
 * @param {number|null} [input.cloudCoverPct] - 0–100; unknown is treated as 50
 * @param {'OPEN'|'PARTIAL'|'COVERED'|'INDOOR'|string|null} [input.exposure]
 * @param {boolean} [input.shaded] - surveyed obstacle shades the seats now
 * @returns {number|null} 0–100, or null when the sun's height is unknown
 */
export function directSunScore({ sunAltitudeDeg, cloudCoverPct = null, exposure = 'OPEN', shaded = false } = {}) {
    const altitude = asFiniteNumber(sunAltitudeDeg);
    if (altitude == null) return null;
    if (altitude <= 0 || shaded) return 0;

    const geometric = clamp01(altitude / SUN_FULL_ALTITUDE_DEG);
    const cloud = asFiniteNumber(cloudCoverPct) ?? UNKNOWN_CLOUD_PCT;
    const cloudFactor = 1 - clamp01(cloud / 100);
    const key = String(exposure ?? 'OPEN').trim().toUpperCase();
    const exposureFactor = EXPOSURE_SUN_FACTOR[key] ?? EXPOSURE_SUN_FACTOR.OPEN;

    return Math.round(geometric * cloudFactor * exposureFactor * 100);
}
