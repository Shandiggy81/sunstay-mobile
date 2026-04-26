/**
 * Sunshine Intelligence Engine
 * ─────────────────────────────────────────────────
 * Three systems unified:
 *   1. Real suncalc integration — sun position, window, golden hour
 *   2. Sunshine Score™ (0–100) — composite outdoor comfort rating
 *   3. Sun orientation engine — venue facing vs solar azimuth
 *
 * Requires: suncalc@^1.9.0 (already in package.json)
 */

import SunCalc from 'suncalc';
import { getWindProfile, calculateApparentTemp, getComfortZone } from './windIntelligence';

// ── Sun Position & Window ─────────────────────────────────────────

/**
 * Get full solar data for a venue at the current moment.
 * Uses real suncalc with venue lat/lng.
 */
export function getSolarData(venue, date = new Date()) {
  const { lat, lng } = venue;
  if (!lat || !lng) return null;

  const times = SunCalc.getTimes(date, lat, lng);
  const position = SunCalc.getPosition(date, lat, lng);

  // Altitude in degrees (negative = below horizon)
  const altitudeDeg = position.altitude * (180 / Math.PI);
  // Azimuth in degrees: SunCalc returns radians from south, convert to 0=N clockwise
  const azimuthDeg = ((position.azimuth * (180 / Math.PI)) + 180) % 360;

  const now = date.getTime();
  const sunriseMs = times.sunrise.getTime();
  const sunsetMs = times.sunset.getTime();
  const solarNoonMs = times.solarNoon.getTime();
  const goldenHourStartMs = times.goldenHour.getTime();
  const goldenHourEndMs = times.goldenHourEnd.getTime();

  const isSunUp = now > sunriseMs && now < sunsetMs;
  const minutesUntilSunset = isSunUp ? Math.max(0, Math.round((sunsetMs - now) / 60000)) : 0;
  const minutesUntilSunrise = !isSunUp ? Math.max(0, Math.round((sunriseMs - now) / 60000)) : 0;
  const isGoldenHour = now >= goldenHourStartMs && now <= goldenHourEndMs;
  const isSolarNoon = Math.abs(now - solarNoonMs) < 30 * 60000; // within 30 min of noon

  const fmtTime = (d) => {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const isPM = h >= 12;
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:${m}${isPM ? 'pm' : 'am'}`;
  };

  const fmtDuration = (mins) => {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return {
    // Raw position
    altitudeDeg: Math.round(altitudeDeg * 10) / 10,
    azimuthDeg: Math.round(azimuthDeg * 10) / 10,

    // Key times
    sunrise: times.sunrise,
    sunriseLabel: fmtTime(times.sunrise),
    sunset: times.sunset,
    sunsetLabel: fmtTime(times.sunset),
    solarNoon: times.solarNoon,
    solarNoonLabel: fmtTime(times.solarNoon),
    goldenHourStart: times.goldenHour,
    goldenHourStartLabel: fmtTime(times.goldenHour),
    goldenHourEnd: times.goldenHourEnd,
    goldenHourEndLabel: fmtTime(times.goldenHourEnd),

    // Status
    isSunUp,
    isGoldenHour,
    isSolarNoon,
    minutesUntilSunset,
    minutesUntilSunrise,
    sunWindowLabel: isSunUp
      ? `${fmtDuration(minutesUntilSunset)} of sun left`
      : minutesUntilSunrise > 0
        ? `Sun rises in ${fmtDuration(minutesUntilSunrise)}`
        : 'Sun has set',

    // Formatted
    sunriseToSunsetLabel: `${fmtTime(times.sunrise)} – ${fmtTime(times.sunset)}`,
  };
}

// ── Venue Sun Orientation Engine ──────────────────────────────────

/**
 * Infer the primary facing direction of a venue's outdoor area.
 * Uses roomIntelligence if present, otherwise infers from vibe/tags/address.
 * Returns bearing in degrees (0=N, 90=E, 180=S, 270=W).
 */
export function getVenueFacingBearing(venue) {
  // Check explicit roomIntelligence data first
  if (venue.roomIntelligence?.naturalLight) {
    const light = venue.roomIntelligence.naturalLight.toLowerCase();
    if (light.includes('north')) return 0;
    if (light.includes('north-east') || light.includes('northeast')) return 45;
    if (light.includes('east')) return 90;
    if (light.includes('south-east') || light.includes('southeast')) return 135;
    if (light.includes('south')) return 180;
    if (light.includes('south-west') || light.includes('southwest')) return 225;
    if (light.includes('west')) return 270;
    if (light.includes('north-west') || light.includes('northwest')) return 315;
  }

  const vibe = (venue.vibe || '').toLowerCase();
  const tags = (venue.tags || []).map(t => t.toLowerCase());
  const address = (venue.address || '').toLowerCase();

  // Coastal venues in Melbourne: bay is to the south/west — beaches face west
  if (vibe.includes('beach') || vibe.includes('beachfront') || tags.includes('sunset')) return 270; // west-facing for sunset
  if (address.includes('esplanade') || address.includes('beaconsfield')) return 270;

  // River/waterfront (Yarra runs east-west, CBD side faces south)
  if (vibe.includes('floating') || vibe.includes('waterfront') || tags.includes('river')) return 180;

  // Rooftops in Melbourne CBD tend to face north (maximise sun in southern hemisphere)
  if (tags.includes('rooftop') || vibe.includes('rooftop')) return 0;

  // Courtyards — typically sheltered, often north-facing
  if (vibe.includes('courtyard') || vibe.includes('maze')) return 0;

  // Beer gardens default to north-facing (best sun in AU)
  if (tags.includes('beer garden') || vibe.includes('beer garden') || vibe.includes('garden')) return 0;

  // Streetside — facing the street, variable
  if (vibe.includes('street')) return 90; // default east

  return 0; // default north (best for Melbourne)
}

/**
 * Determine if the sun is currently shining on the venue's outdoor area.
 * Compares solar azimuth to venue facing direction.
 * Returns { isLit, angleDiff, quality: 'direct'|'partial'|'shade' }
 */
export function getSunExposureAtVenue(venue, date = new Date()) {
  const solar = getSolarData(venue, date);
  if (!solar || !solar.isSunUp) {
    return { isLit: false, angleDiff: null, quality: 'shade', label: 'Sun has set' };
  }

  const facingBearing = getVenueFacingBearing(venue);
  const solarAzimuth = solar.azimuthDeg;

  // Angular difference between sun azimuth and venue facing direction
  let diff = Math.abs(solarAzimuth - facingBearing);
  if (diff > 180) diff = 360 - diff;

  // In southern hemisphere: sun arcs through the north
  // Direct sun: within 45° of venue facing direction
  // Partial sun: 45–90°
  // Shade: >90°
  let quality, isLit;
  if (solar.altitudeDeg < 5) {
    quality = 'shade';
    isLit = false;
  } else if (diff <= 45) {
    quality = 'direct';
    isLit = true;
  } else if (diff <= 90) {
    quality = 'partial';
    isLit = true;
  } else {
    quality = 'shade';
    isLit = false;
  }

  const profile = getWindProfile(venue);
  // Shade factor can block sun even when it's geometrically overhead
  const effectiveShadeFactor = (venue.shielding?.shadeFactor || 50) / 100;
  if (effectiveShadeFactor > 0.85 && quality === 'direct') quality = 'partial';

  return {
    isLit,
    angleDiff: Math.round(diff),
    quality,
    solarAzimuth: solar.azimuthDeg,
    altitudeDeg: solar.altitudeDeg,
    facingBearing,
    label:
      quality === 'direct' ? 'Direct sunshine' :
      quality === 'partial' ? 'Partial sun' :
      'In shade right now',
  };
}

/**
 * Calculate sun exposure timeline for a venue across the day (every 30 min).
 * Used by the Sun Shadow Simulator scrubber.
 */
export function getSunTimeline(venue, date = new Date()) {
  const baseDate = new Date(date);
  baseDate.setHours(6, 0, 0, 0);
  const slots = [];

  for (let i = 0; i <= 28; i++) { // 6am to 8pm in 30-min steps
    const slotDate = new Date(baseDate.getTime() + i * 30 * 60000);
    const solar = getSolarData(venue, slotDate);
    const exposure = getSunExposureAtVenue(venue, slotDate);

    const h = slotDate.getHours();
    const m = slotDate.getMinutes();
    const isPM = h >= 12;
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const label = `${displayH}${m === 30 ? ':30' : ''}${isPM ? 'pm' : 'am'}`;

    slots.push({
      time: slotDate,
      label,
      hour: h,
      minute: m,
      altitudeDeg: solar?.altitudeDeg || 0,
      azimuthDeg: solar?.azimuthDeg || 0,
      quality: exposure.quality,
      isLit: exposure.isLit,
      isSunUp: solar?.isSunUp || false,
    });
  }

  return slots;
}

// ── Sunshine Score™ ───────────────────────────────────────────────

/**
 * Calculate the Sunshine Score™ (0–100) for a venue.
 *
 * Composite of:
 *   - Sun window remaining (0–25 pts) — how much sun is left today
 *   - Direct sun exposure quality (0–25 pts) — is sun hitting the space right now
 *   - Comfort zone / feels-like temp (0–20 pts) — BOM apparent temp
 *   - Wind exposure (0–15 pts) — venue shelter factor
 *   - UV index quality (0–10 pts) — sweet spot is UV 3–6
 *   - Time-of-day bonus (0–5 pts) — golden hour premium
 *
 * @param {object} venue — venue object with lat/lng/shielding
 * @param {object} weather — { temp, windSpeed, humidity, uvIndex, cloudCover }
 * @param {Date} date — defaults to now
 * @returns {{ score, grade, gradeLabel, gradeColor, breakdown, label }}
 */
export function calculateSunshineScore(venue, weather = {}, date = new Date()) {
  const solar = getSolarData(venue, date);
  const exposure = getSunExposureAtVenue(venue, date);
  const profile = getWindProfile(venue);

  const temp = weather.temp ?? 20;
  const windSpeed = (weather.windSpeed ?? 10) / 3.6; // convert km/h to m/s
  const humidity = weather.humidity ?? 60;
  const uvIndex = weather.uvIndex ?? venue.weatherNow?.uvIndex ?? 5;
  const cloudCover = weather.cloudCover ?? 0; // 0–100%

  const apparentTemp = calculateApparentTemp(temp, windSpeed, humidity, profile.shelterFactor);
  const comfort = getComfortZone(apparentTemp);

  let score = 0;
  const breakdown = {};

  // 1. Sun window remaining (0–25 pts)
  let sunPts = 0;
  if (solar?.isSunUp) {
    const mins = solar.minutesUntilSunset;
    if (mins >= 240) sunPts = 25;       // 4+ hours
    else if (mins >= 120) sunPts = 20;  // 2–4 hours
    else if (mins >= 60) sunPts = 13;   // 1–2 hours
    else if (mins >= 30) sunPts = 7;    // 30–60 min
    else sunPts = 3;                    // < 30 min

    // Cloud cover penalty
    const cloudPenalty = Math.round((cloudCover / 100) * sunPts * 0.6);
    sunPts = Math.max(0, sunPts - cloudPenalty);
  }
  breakdown.sunWindow = sunPts;
  score += sunPts;

  // 2. Direct sun exposure quality (0–25 pts)
  let exposurePts = 0;
  if (exposure.quality === 'direct') exposurePts = 25;
  else if (exposure.quality === 'partial') exposurePts = 12;
  else exposurePts = 0;
  breakdown.sunExposure = exposurePts;
  score += exposurePts;

  // 3. Comfort zone (0–20 pts)
  const comfortMap = { warm: 20, mild: 16, cool: 8, hot: 6, cold: 2, extreme: 0, unknown: 0 };
  const comfortPts = comfortMap[comfort.level] ?? 0;
  breakdown.comfort = comfortPts;
  score += comfortPts;

  // 4. Wind (0–15 pts) — lower exposure = better
  const windPts = Math.round((1 - profile.exposure) * 15);
  breakdown.wind = windPts;
  score += windPts;

  // 5. UV index (0–10 pts) — sweet spot 3–6, penalty for 0–2 (no sun) or 9+ (dangerous)
  let uvPts = 0;
  if (uvIndex >= 3 && uvIndex <= 6) uvPts = 10;
  else if (uvIndex === 7 || uvIndex === 8) uvPts = 7;
  else if (uvIndex === 2) uvPts = 4;
  else if (uvIndex === 1) uvPts = 2;
  else if (uvIndex >= 9) uvPts = 3; // high UV, score but flag
  breakdown.uv = uvPts;
  score += uvPts;

  // 6. Golden hour bonus (0–5 pts)
  const goldenPts = solar?.isGoldenHour ? 5 : 0;
  breakdown.goldenHour = goldenPts;
  score += goldenPts;

  score = Math.min(100, Math.max(0, Math.round(score)));

  // Grade
  let grade, gradeLabel, gradeColor, gradeBg, gradeEmoji;
  if (score >= 85) {
    grade = 'S'; gradeLabel = 'Perfect Sun'; gradeColor = '#f59e0b'; gradeBg = '#fef3c7'; gradeEmoji = '✨';
  } else if (score >= 65) {
    grade = 'A'; gradeLabel = 'Great Sunshine'; gradeColor = '#10b981'; gradeBg = '#d1fae5'; gradeEmoji = '☀️';
  } else if (score >= 40) {
    grade = 'B'; gradeLabel = 'Partial Sun'; gradeColor = '#f97316'; gradeBg = '#ffedd5'; gradeEmoji = '🌤️';
  } else {
    grade = 'C'; gradeLabel = 'Low Sun'; gradeColor = '#6b7280'; gradeBg = '#f3f4f6'; gradeEmoji = '☁️';
  }

  return {
    score,
    grade,
    gradeLabel,
    gradeColor,
    gradeBg,
    gradeEmoji,
    breakdown,
    solar,
    exposure,
    comfort,
    apparentTemp,
    label: `${gradeEmoji} ${score}/100 · ${gradeLabel}`,
  };
}

/**
 * Sort venues by Sunshine Score descending — the "Best Right Now" sort.
 */
export function sortByShineScore(venues, weather = {}, date = new Date()) {
  return [...venues]
    .map(v => ({ venue: v, score: calculateSunshineScore(v, weather, date) }))
    .sort((a, b) => b.score.score - a.score.score)
    .map(({ venue, score }) => ({ ...venue, _sunshineScore: score }));
}
