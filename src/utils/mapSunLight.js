/**
 * Mapbox lights for a sun altitude/azimuth, used by the time-of-day slider.
 *
 * The map should look like daytime whenever it is daytime. Brightness
 * reaches full soon after sunrise (sun 12° up, about an hour after sunrise
 * in Melbourne), and the warm golden tint is kept for the low sun near
 * sunrise and sunset. The old curve only reached full brightness with the
 * sun 45° up, which on an October morning is about 10am, so a sunny 7:30am
 * looked like dusk.
 */

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function lerpColor(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * clamp01(t)));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const WARM_LIGHT = '#ffd8a8';
export const DAY_LIGHT = '#ffffff';

/**
 * @param {number} altDeg sun altitude, degrees (negative below the horizon)
 * @param {number} azDegFromSouth suncalc azimuth in degrees (0 = south, + toward west)
 * @returns {{ direction: [number, number], color: string, intensity: number, ambientIntensity: number, daylight: number }}
 */
export function sunLightFor(altDeg, azDegFromSouth) {
    // Mapbox directional light: azimuth 0 = north, clockwise; polar 0 = overhead.
    const azimuthal = (((azDegFromSouth + 180) % 360) + 360) % 360;
    // Keep the light above the ground so shadows stay long instead of vanishing.
    const polar = Math.max(5, Math.min(89, 90 - altDeg));

    // 0 at night, 1 from 12° up: full daylight soon after sunrise.
    const daylight = smoothstep(-4, 12, altDeg);
    // 1 with the sun on the horizon, 0 from 20° up.
    const warmth = 1 - smoothstep(2, 20, altDeg);

    return {
        direction: [azimuthal, polar],
        color: lerpColor(DAY_LIGHT, WARM_LIGHT, warmth),
        // Ambient carries most of the brightness of flat ground when the sun
        // is low; the directional light gives the 3D buildings their shadows.
        intensity: 0.25 + 0.2 * daylight,
        ambientIntensity: 0.35 + 0.55 * daylight,
        daylight,
    };
}
