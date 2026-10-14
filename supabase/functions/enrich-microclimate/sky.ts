/**
 * Is the sun actually getting through? Open-Meteo's cloud_cover counts thin
 * high cloud, so clear-feeling mornings came back "100% cloud" and every
 * venue's effective_sun collapsed to almost nothing. shortwave_radiation
 * (sunlight reaching the ground) already allows for how thick the cloud
 * is, so compare it with what a clear sky would give at this sun height and
 * turn that into the cloud percentage the score uses.
 *
 * Same maths as src/utils/skyClearness.js in the app (kept separate because
 * Edge Functions cannot import from src/). Tested by
 * src/utils/enrichMicroclimateSky.test.js.
 */

export const SUNNY_CLEARNESS = 0.55;
export const MIN_CLEAR_SKY_WM2 = 80;

const RAD = Math.PI / 180;

/** Sun altitude in degrees (NOAA approximation, ±0.5°). */
export function solarAltitudeDeg(date: Date, lat: number, lng: number): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = Math.floor((date.getTime() - start) / 86400000) + 1;
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = (2 * Math.PI / 365) * (doy - 1 + (utcH - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = ((utcH * 60 + eqt + 4 * lng) / 4 - 180) * RAD;
  const phi = lat * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/** Clear-sky sunlight on flat ground, W/m² (Haurwitz). */
export function clearSkyGhi(altitudeDeg: number): number {
  if (!Number.isFinite(altitudeDeg) || altitudeDeg <= 0) return 0;
  const s = Math.sin(altitudeDeg * RAD);
  return 1098 * s * Math.exp(-0.057 / s);
}

/** 0 (dull) … 1 (clear), or null when the sun is too low to judge. */
export function skyClearness(radiation: number | null | undefined, altitudeDeg: number): number | null {
  const clear = clearSkyGhi(altitudeDeg);
  if (radiation == null || !Number.isFinite(radiation) || radiation < 0 || clear < MIN_CLEAR_SKY_WM2) return null;
  return Math.min(1, radiation / clear);
}

/**
 * Cloud cover as the sun experiences it: clearness 1 → 0 %, the sunny
 * threshold → 60 %, 0.1 → 100 %. Unknown clearness keeps the reported value.
 */
export function effectiveCloudCover(reportedPct: number, clearness: number | null): number {
  if (clearness == null || !Number.isFinite(clearness)) return reportedPct;
  const pct = ((1 - clearness) / (1 - SUNNY_CLEARNESS)) * 60;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

/**
 * Cloud percentage to score with, from Open-Meteo `current` values. The
 * current shortwave_radiation is a 15-minute mean, so the sun is placed
 * 7.5 minutes earlier.
 */
export function scoringCloudCover(
  reportedPct: number,
  radiation: number | null | undefined,
  lat: number,
  lng: number,
  now: Date = new Date(),
): number {
  const alt = solarAltitudeDeg(new Date(now.getTime() - 7.5 * 60 * 1000), lat, lng);
  return effectiveCloudCover(reportedPct, skyClearness(radiation, alt));
}
