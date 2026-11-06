import SunCalc from 'suncalc';
import { sunCalcAzimuthToBearing } from './compass.js';

const RAD = 180 / Math.PI;
const validDate = (d) => d instanceof Date && Number.isFinite(d.getTime());

/**
 * Today's sun path at a location, for drawing an altitude arc.
 *
 * Returns null when the inputs are unusable or the sun never rises/sets
 * (polar day/night), so callers can hide the chart instead of drawing NaN.
 *
 * points    – altitude (deg) sampled from sunrise to sunset, `t` in 0..1
 * progress  – where "now" sits on that path: <0 before sunrise, >1 after sunset
 */
export function buildSunPath(lat, lng, now = new Date(), samples = 48) {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || !validDate(now)) return null;

    // Anchor on local noon so a late-evening `now` still resolves to today's times.
    const anchor = new Date(now);
    anchor.setHours(12, 0, 0, 0);
    const times = SunCalc.getTimes(anchor, la, ln);
    const { sunrise, sunset, solarNoon } = times;
    if (!validDate(sunrise) || !validDate(sunset) || sunset <= sunrise) return null;

    const span = sunset.getTime() - sunrise.getTime();
    const points = [];
    for (let i = 0; i <= samples; i += 1) {
        const t = i / samples;
        const at = new Date(sunrise.getTime() + span * t);
        points.push({ t, altitude: SunCalc.getPosition(at, la, ln).altitude * RAD });
    }
    // Endpoints sit on the horizon by definition; SunCalc's refraction offset
    // leaves them a fraction of a degree negative.
    points[0].altitude = 0;
    points[points.length - 1].altitude = 0;

    const pos = SunCalc.getPosition(now, la, ln);
    const maxAltitude = SunCalc.getPosition(solarNoon, la, ln).altitude * RAD;

    return {
        sunrise,
        sunset,
        solarNoon,
        points,
        maxAltitude,
        progress: (now.getTime() - sunrise.getTime()) / span,
        current: {
            altitude: pos.altitude * RAD,
            bearing: sunCalcAzimuthToBearing(pos.azimuth * RAD),
        },
    };
}
