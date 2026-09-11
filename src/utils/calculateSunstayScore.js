/**
 * Sunstay cozy-index for outdoor hospitality venues (Melbourne context).
 *
 * Pure ES6 module — no React, no suncalc. Pairing / live weather scoring
 * lives in `sunScore.js` and is a different model; do not conflate the two.
 *
 * Examples:
 *   calculateSunstayScore({ temperatureC: 21, windKmh: 8, rainProbability: 5,
 *     sunAzimuthDeg: 0, sunAltitudeDeg: 40, venueExposureFacing: 'N', exposure: 'OPEN' })
 *   → high 80s, "Perfect Sun" / "Ideal Terrace"
 *
 *   calculateSunstayScore({ temperatureC: 12, windKmh: 10, rainProbability: 10 })
 *   → mid 40s, "Too Cold"
 *
 *   calculateSunstayScore({ temperatureC: 22, windKmh: 5, rainProbability: 70, exposure: 'OPEN' })
 *   → < 30, "Seek Shelter"
 *
 *   calculateSunstayScore({ temperatureC: 22, windKmh: 5, rainProbability: 70, exposure: 'COVERED' })
 *   → stays mid/high, "Cosy Covered"
 */

/**
 * @typedef {Object} SunstayScoreInput
 * @property {number} temperatureC - Air temperature in °C
 * @property {number} windKmh - Wind speed in km/h
 * @property {number} rainProbability - Rain probability 0–100
 * @property {number} [uvIndex] - UV index (0–11+)
 * @property {number} [sunAzimuthDeg] - Sun azimuth degrees, 0=N clockwise (optional)
 * @property {number} [sunAltitudeDeg] - Sun altitude degrees above horizon (optional)
 * @property {string|number} [venueExposureFacing] - Compass facing of unshaded exposure (e.g. 'N','NE', degrees)
 * @property {'OPEN'|'PARTIAL'|'COVERED'|'INDOOR'|string} [exposure] - Venue exposure class
 */

/**
 * @typedef {Object} SunstayScoreResult
 * @property {number} score - Integer cozy-index, clamped 0–100
 * @property {string} label - Dominant-factor label (e.g. "Perfect Sun")
 */

// ── Tunable weights ────────────────────────────────────────────────
// BASELINE_SCORE — start in the “pretty good terrace” band before adjustments.
const BASELINE_SCORE = 76;

// Temperature: sweet spot 19–24°C. Steep penalties below 14°C or above 32°C.
const TEMP_SWEET_MIN_C = 19;
const TEMP_SWEET_MAX_C = 24;
const TEMP_COLD_HARD_C = 14;
const TEMP_HOT_HARD_C = 32;
const TEMP_SWEET_BONUS = 8;           // points added inside the 19–24 band
const TEMP_SHOULDER_PER_DEG = 2.4;    // 14–19 and 24–32 (linear)
const TEMP_COLD_STEEP_PER_DEG = 10;   // < 14°C (too cold)
const TEMP_HOT_STEEP_PER_DEG = 8;     // > 32°C (sweltering)

// Wind: progressive deduct above 20 km/h; severe above 35 km/h.
const WIND_SOFT_KMH = 20;
const WIND_SEVERE_KMH = 35;
const WIND_SOFT_PER_KMH = 1.0;        // 20–35 km/h
const WIND_SEVERE_PER_KMH = 3.0;      // additional deduct per km/h above 35

// Precipitation: uncovered rain > 40% must crash the score below 30.
const RAIN_CRASH_PCT = 40;
const RAIN_CRASH_CAP = 29;            // hard ceiling when crash applies (< 30)
const RAIN_CRASH_MULTIPLIER = 0.32;   // multiplicative crash on uncovered rain
const RAIN_CRASH_EXTRA_PER_PCT = 0.15;// extra subtract per point above 40%
const RAIN_SOFT_START_PCT = 15;
const RAIN_SOFT_PER_PCT = 0.45;       // uncovered drizzle 15–40%
const RAIN_SHELTERED_PER_PCT = 0.12;  // COVERED / INDOOR never crash

// Sun alignment: sun is “on the terrace” when |azimuth − facing| ≤ this.
const ALIGNMENT_THRESHOLD_DEG = 60;
// Altitude “sufficient” for useful direct sun ( Melb winter sun sits low ).
const MIN_SUN_ALTITUDE_DEG = 12;      // documented band: > 10–15°
// Opposite-facing shade: complementary arc (180° − alignment threshold).
const OPPOSITE_THRESHOLD_DEG = 180 - ALIGNMENT_THRESHOLD_DEG; // 120°

// Cool-weather sun reward (< 20°C) when aligned + altitude sufficient.
const COOL_WEATHER_C = 20;
const COOL_SUN_OPEN_BONUS = 14;
const COOL_SUN_PARTIAL_BONUS = 8;

// Hot weather (> 28°C) or UV ≥ 8: penalise direct sun, reward shade.
const HOT_WEATHER_C = 28;
const HARSH_UV_INDEX = 8;
const HOT_SUN_OPEN_PENALTY = 18;
const HOT_SUN_PARTIAL_PENALTY = 8;
const HOT_SHADE_REWARD = 12;          // COVERED / INDOOR / opposite-facing
const HOT_UNALIGNED_OPEN_REWARD = 6;  // orientation already shades the terrace
const HARSH_UV_EXPOSED_FALLBACK = 0.5;// fraction of hot-sun penalty when UV known but no azimuth

// Mild band (20–28°C, UV < 8): a little extra for pleasant terrace sun.
const MILD_SUN_OPEN_BONUS = 6;

/** Compass → centre azimuth in degrees (0 = North, clockwise). */
const DIRECTION_MAP = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

/**
 * @param {*} value
 * @param {number|null} [fallback=null]
 * @returns {number|null}
 */
function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse venue facing into degrees (0=N clockwise).
 * Accepts compass strings ('N', 'NE', 'ssw') or numeric degrees.
 * @param {string|number|null|undefined} facing
 * @returns {number|null}
 */
function parseFacing(facing) {
  if (facing === null || facing === undefined || facing === '') return null;
  if (typeof facing === 'number') {
    return Number.isFinite(facing) ? ((facing % 360) + 360) % 360 : null;
  }
  const key = String(facing).trim().toUpperCase();
  if (key in DIRECTION_MAP) return DIRECTION_MAP[key];
  const num = parseFloat(key);
  if (Number.isFinite(num)) return ((num % 360) + 360) % 360;
  return null;
}

/**
 * Smallest angular difference between two azimuths, result in [0, 180].
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function angularDiff(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * @param {string|undefined|null} exposure
 * @returns {string}
 */
function normalizeExposure(exposure) {
  if (exposure == null || exposure === '') return 'OPEN';
  return String(exposure).trim().toUpperCase();
}

/**
 * @param {string} exposureNorm
 * @returns {boolean}
 */
function isShelteredExposure(exposureNorm) {
  return exposureNorm === 'COVERED' || exposureNorm === 'INDOOR';
}

/**
 * Temperature delta from baseline. Positive = bonus, negative = penalty.
 * @param {number|null} temperatureC
 * @returns {number}
 */
function temperatureDelta(temperatureC) {
  if (temperatureC == null) return 0;

  if (temperatureC >= TEMP_SWEET_MIN_C && temperatureC <= TEMP_SWEET_MAX_C) {
    return TEMP_SWEET_BONUS;
  }

  if (temperatureC < TEMP_SWEET_MIN_C) {
    const shoulder = Math.min(TEMP_SWEET_MIN_C - temperatureC, TEMP_SWEET_MIN_C - TEMP_COLD_HARD_C);
    const steep = Math.max(0, TEMP_COLD_HARD_C - temperatureC);
    return -(shoulder * TEMP_SHOULDER_PER_DEG + steep * TEMP_COLD_STEEP_PER_DEG);
  }

  const shoulder = Math.min(temperatureC - TEMP_SWEET_MAX_C, TEMP_HOT_HARD_C - TEMP_SWEET_MAX_C);
  const steep = Math.max(0, temperatureC - TEMP_HOT_HARD_C);
  return -(shoulder * TEMP_SHOULDER_PER_DEG + steep * TEMP_HOT_STEEP_PER_DEG);
}

/**
 * Wind deduct (always ≤ 0).
 * @param {number|null} windKmh
 * @returns {number}
 */
function windDelta(windKmh) {
  if (windKmh == null || windKmh <= WIND_SOFT_KMH) return 0;
  const softSpan = Math.min(windKmh, WIND_SEVERE_KMH) - WIND_SOFT_KMH;
  const severeSpan = Math.max(0, windKmh - WIND_SEVERE_KMH);
  return -(softSpan * WIND_SOFT_PER_KMH + severeSpan * WIND_SEVERE_PER_KMH);
}

/**
 * Rain adjustment. Uncovered > 40% returns a crash plan (multiply + cap).
 * @param {number|null} rainProbability
 * @param {boolean} sheltered
 * @returns {{ add: number, multiply: number|null, cap: number|null }}
 */
function rainAdjustment(rainProbability, sheltered) {
  const rain = rainProbability == null ? 0 : Math.max(0, rainProbability);

  if (rain > RAIN_CRASH_PCT && !sheltered) {
    return {
      add: -((rain - RAIN_CRASH_PCT) * RAIN_CRASH_EXTRA_PER_PCT),
      multiply: RAIN_CRASH_MULTIPLIER,
      cap: RAIN_CRASH_CAP,
    };
  }

  const over = Math.max(0, rain - RAIN_SOFT_START_PCT);
  const perPct = sheltered ? RAIN_SHELTERED_PER_PCT : RAIN_SOFT_PER_PCT;
  return { add: -(over * perPct), multiply: null, cap: null };
}

/**
 * Sun / shade pivot. Skips alignment terms when azimuth, facing, or altitude
 * is missing so callers never get NaN from incomplete sun fields.
 *
 * @param {object} ctx
 * @param {number|null} ctx.temperatureC
 * @param {number|null} ctx.uvIndex
 * @param {number|null} ctx.sunAzimuthDeg
 * @param {number|null} ctx.sunAltitudeDeg
 * @param {number|null} ctx.facingDeg
 * @param {string} ctx.exposureNorm
 * @param {boolean} ctx.sheltered
 * @returns {{ delta: number, sunOnTerrace: boolean, oppositeFacing: boolean, isHarshUvOrHeat: boolean, isCool: boolean, hasAlignmentInputs: boolean }}
 */
function sunShadeDelta(ctx) {
  const {
    temperatureC,
    uvIndex,
    sunAzimuthDeg,
    sunAltitudeDeg,
    facingDeg,
    exposureNorm,
    sheltered,
  } = ctx;

  const temp = temperatureC == null ? 21 : temperatureC;
  const isCool = temp < COOL_WEATHER_C;
  const isHarshUvOrHeat = temp > HOT_WEATHER_C || (uvIndex != null && uvIndex >= HARSH_UV_INDEX);

  const hasAlignmentInputs =
    sunAzimuthDeg != null &&
    facingDeg != null &&
    sunAltitudeDeg != null &&
    sunAltitudeDeg > MIN_SUN_ALTITUDE_DEG;

  let sunOnTerrace = false;
  let oppositeFacing = false;
  if (hasAlignmentInputs) {
    const diff = angularDiff(sunAzimuthDeg, facingDeg);
    sunOnTerrace = diff <= ALIGNMENT_THRESHOLD_DEG;
    oppositeFacing = diff >= OPPOSITE_THRESHOLD_DEG;
  }

  let delta = 0;

  if (isCool && hasAlignmentInputs && sunOnTerrace) {
    if (exposureNorm === 'OPEN') delta += COOL_SUN_OPEN_BONUS;
    else if (exposureNorm === 'PARTIAL') delta += COOL_SUN_PARTIAL_BONUS;
  }

  if (isHarshUvOrHeat) {
    if (hasAlignmentInputs && sunOnTerrace) {
      if (exposureNorm === 'OPEN') delta -= HOT_SUN_OPEN_PENALTY;
      else if (exposureNorm === 'PARTIAL') delta -= HOT_SUN_PARTIAL_PENALTY;
    } else if (!hasAlignmentInputs && (exposureNorm === 'OPEN' || exposureNorm === 'PARTIAL') && uvIndex != null && uvIndex >= HARSH_UV_INDEX) {
      // UV known, sun geometry unknown: modest exposure penalty, no NaN alignment.
      const base = exposureNorm === 'OPEN' ? HOT_SUN_OPEN_PENALTY : HOT_SUN_PARTIAL_PENALTY;
      delta -= base * HARSH_UV_EXPOSED_FALLBACK;
    }

    if (sheltered || oppositeFacing) {
      delta += HOT_SHADE_REWARD;
    } else if (hasAlignmentInputs && !sunOnTerrace && exposureNorm === 'OPEN') {
      delta += HOT_UNALIGNED_OPEN_REWARD;
    }
  } else if (!isCool && hasAlignmentInputs && sunOnTerrace && exposureNorm === 'OPEN') {
    delta += MILD_SUN_OPEN_BONUS;
  }

  return { delta, sunOnTerrace, oppositeFacing, isHarshUvOrHeat, isCool, hasAlignmentInputs };
}

/**
 * Contextual label from the dominant comfort factor (not just the score band).
 * @param {object} ctx
 * @returns {string}
 */
function pickLabel(ctx) {
  const {
    temperatureC,
    windKmh,
    rainProbability,
    sheltered,
    sunOnTerrace,
    oppositeFacing,
    isHarshUvOrHeat,
    isCool,
    score,
    exposureNorm,
    sunOnTerraceKnown,
  } = ctx;

  const temp = temperatureC == null ? 21 : temperatureC;
  const wind = windKmh == null ? 0 : windKmh;
  const rain = rainProbability == null ? 0 : rainProbability;

  if (!sheltered && rain > RAIN_CRASH_PCT) return 'Seek Shelter';
  if (temp < TEMP_COLD_HARD_C) return 'Too Cold';
  if (temp > TEMP_HOT_HARD_C) return 'Sweltering';
  if (wind > WIND_SEVERE_KMH) return 'Too Windy';

  if (sheltered && rain > RAIN_CRASH_PCT) return 'Cosy Covered';

  if (isHarshUvOrHeat) {
    const inShade = sheltered || oppositeFacing || (sunOnTerraceKnown && !sunOnTerrace);
    if (inShade) {
      if (wind > 12 && wind <= WIND_SEVERE_KMH) return 'Breezy Shade';
      return 'Cool Shade';
    }
    return sunOnTerrace ? 'Harsh Sun' : 'Seek Shade';
  }

  if (isCool && sunOnTerrace && !sheltered) {
    return score >= 80 ? 'Perfect Sun' : 'Winter Sun';
  }

  if (wind > WIND_SOFT_KMH && wind <= WIND_SEVERE_KMH && score >= 50) {
    const inShade = sheltered || oppositeFacing || (sunOnTerraceKnown && !sunOnTerrace);
    return inShade ? 'Breezy Shade' : 'Breezy Terrace';
  }

  if (score >= 85) return sunOnTerrace || exposureNorm === 'OPEN' ? 'Perfect Sun' : 'Ideal Terrace';
  if (score >= 70) return 'Great Conditions';
  if (score >= 50) return 'Fair Comfort';
  if (score >= 30) return 'Bundle Up';
  return 'Stay In';
}

/**
 * Cozy-index for a Melbourne outdoor hospitality venue.
 *
 * @param {SunstayScoreInput} input
 * @returns {SunstayScoreResult}
 */
export function calculateSunstayScore(input = {}) {
  const temperatureC = toFiniteNumber(input.temperatureC);
  const windKmh = toFiniteNumber(input.windKmh, 0);
  const rainProbability = toFiniteNumber(input.rainProbability, 0);
  const uvIndex = toFiniteNumber(input.uvIndex);
  const sunAzimuthDeg = toFiniteNumber(input.sunAzimuthDeg);
  const sunAltitudeDeg = toFiniteNumber(input.sunAltitudeDeg);
  const facingDeg = parseFacing(input.venueExposureFacing);
  const exposureNorm = normalizeExposure(input.exposure);
  const sheltered = isShelteredExposure(exposureNorm);

  const dTemp = temperatureDelta(temperatureC);
  const dWind = windDelta(windKmh);
  const rain = rainAdjustment(rainProbability, sheltered);
  const sun = sunShadeDelta({
    temperatureC,
    uvIndex,
    sunAzimuthDeg,
    sunAltitudeDeg,
    facingDeg,
    exposureNorm,
    sheltered,
  });

  let raw = BASELINE_SCORE + dTemp + dWind + rain.add + sun.delta;
  if (rain.multiply != null) raw *= rain.multiply;
  if (rain.cap != null) raw = Math.min(raw, rain.cap);

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const label = pickLabel({
    temperatureC,
    windKmh,
    rainProbability,
    sheltered,
    sunOnTerrace: sun.sunOnTerrace,
    oppositeFacing: sun.oppositeFacing,
    isHarshUvOrHeat: sun.isHarshUvOrHeat,
    isCool: sun.isCool,
    score,
    exposureNorm,
    sunOnTerraceKnown: sun.hasAlignmentInputs,
  });

  return { score, label };
}
