/**
 * Is the sun actually getting through? Open-Meteo's `cloud_cover` counts
 * every layer, so thin high cloud (cirrus) reads as "Overcast" on mornings
 * when people are sitting in full sun. Its `shortwave_radiation` (sunlight
 * reaching the ground) already accounts for how thick the cloud is, so we
 * compare it with the sunlight a clear sky would give at that sun height.
 *
 *   clearness = forecast sunlight / clear-sky sunlight     (0 dull … 1 clear)
 *
 * Clear-sky sunlight uses the Haurwitz model, 1098 · sin(alt) · e^(−0.057 / sin(alt)) W/m².
 * Near sunrise and sunset both numbers are tiny and the ratio is noise, so
 * those hours return null and callers fall back to cloud cover.
 */
import SunCalc from 'suncalc';

/** Ratio at or above which an hour counts as direct sun. */
export const SUNNY_CLEARNESS = 0.55;
/** Below this clear-sky sunlight (sun lower than ~5°) the ratio is not used. */
export const MIN_CLEAR_SKY_WM2 = 80;

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Clear-sky sunlight on flat ground (W/m²) for a sun altitude in degrees. */
export function clearSkyGhi(altitudeDeg) {
    const alt = finite(altitudeDeg);
    if (alt == null || alt <= 0) return 0;
    const s = Math.sin((alt * Math.PI) / 180);
    return 1098 * s * Math.exp(-0.057 / s);
}

/**
 * @param {number|null} radiation forecast sunlight, W/m²
 * @param {number} altitudeDeg sun altitude for the same moment
 * @returns {number|null} 0–1, or null when the sun is too low to judge
 */
export function clearnessRatio(radiation, altitudeDeg) {
    const r = finite(radiation);
    const clear = clearSkyGhi(altitudeDeg);
    if (r == null || r < 0 || clear < MIN_CLEAR_SKY_WM2) return null;
    return Math.min(1, r / clear);
}

function altitudeAt(ms, lat, lng) {
    return (SunCalc.getPosition(new Date(ms), lat, lng).altitude * 180) / Math.PI;
}

/** Open-Meteo wall-clock "YYYY-MM-DDTHH:MM" → UTC ms. */
function wallToUtcMs(iso, utcOffsetSeconds) {
    if (typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return ms - utcOffsetSeconds * 1000;
}

/**
 * Clearness for each hourly slot, aligned with `hourly.time`.
 *
 * Open-Meteo's hourly `shortwave_radiation` is the mean over the PRECEDING
 * hour, so the slot that starts at time[i] (the hour the app labels i) is
 * described by the value stamped time[i + 1], compared with clear-sky
 * sunlight at the middle of that hour.
 *
 * @returns {(number|null)[]}
 */
export function hourlySkyClearness(hourly, utcOffsetSeconds, lat, lng) {
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const rad = Array.isArray(hourly?.shortwave_radiation) ? hourly.shortwave_radiation : [];
    const offset = finite(utcOffsetSeconds);
    if (!times.length || !rad.length || offset == null || finite(lat) == null || finite(lng) == null) {
        return times.map(() => null);
    }
    return times.map((iso, i) => {
        const start = wallToUtcMs(iso, offset);
        if (start == null) return null;
        const r = finite(rad[i + 1]);
        if (r == null) return null;
        return clearnessRatio(r, altitudeAt(start + 30 * 60 * 1000, lat, lng));
    });
}

/** Clearness right now from Open-Meteo's `current.shortwave_radiation` (15-minute mean). */
export function currentSkyClearness(radiation, lat, lng, now = new Date()) {
    if (finite(lat) == null || finite(lng) == null) return null;
    return clearnessRatio(radiation, altitudeAt(now.getTime() - 7.5 * 60 * 1000, lat, lng));
}

/**
 * The weather code to show, given how clear the sky really is. Only the
 * cloud codes move (0 clear, 1 mainly clear, 2 partly cloudy, 3 overcast);
 * rain, fog, snow and storms are always kept.
 *
 * @param {number|null} code WMO weather code
 * @param {number|null} clearness
 * @returns {number|null}
 */
export function codeForClearness(code, clearness) {
    const c = finite(code);
    const k = finite(clearness);
    if (c == null || k == null || c < 0 || c > 3) return c;
    if (k >= 0.8) return Math.min(c, 1);
    if (k >= SUNNY_CLEARNESS) return c === 3 ? 2 : c;
    if (k >= 0.35) return Math.max(c, 2);
    return 3;
}

/**
 * Cloud cover as the sun experiences it, for the scores and labels that
 * read a cloud percentage. Clearness 1 → 0%, clearness at the sunny
 * threshold → 60% (the "cloudy" line in sunForecastState), 0.1 → 100%.
 * Unknown clearness keeps the reported cloud cover.
 *
 * @param {number|null} reportedPct Open-Meteo cloud_cover, 0–100
 * @param {number|null} clearness
 * @returns {number|null}
 */
export function effectiveCloudCover(reportedPct, clearness) {
    const k = finite(clearness);
    if (k == null) return finite(reportedPct);
    const pct = ((1 - k) / (1 - SUNNY_CLEARNESS)) * 60;
    return Math.round(Math.max(0, Math.min(100, pct)));
}
