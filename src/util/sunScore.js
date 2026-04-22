/**
 * Sunstay Score Engine v2
 * 
 * LIVE score: uses real-time Open-Meteo data (primary)
 * STATIC score: uses venue seasonal hours + obstruction (fallback)
 * 
 * Live formula weights:
 *   Solar intensity  35%  (shortwave_radiation W/m²)
 *   Comfort band     30%  (apparent_temperature, peak 18–26°C)
 *   Rain penalty     20%  (precipitation_probability)
 *   Cloud penalty    10%  (cloud_cover %)
 *   Wind penalty      5%  (wind_gusts km/h)
 */
// ─── LIVE SCORE (real-time weather) ────────────────────────────────────────
/**
 * Calculate a 0–100 Sunstay Score from live Open-Meteo weather data.
 * @param {object} weather - output from getMelbourneWeather()
 * @returns {{ score: number, label: string, color: string, breakdown: object }}
 */
export function calculateLiveSunScore(weather) {
  if (!weather) return { score: 50, ...getSunScoreLabel(50), breakdown: {} };
  const {
    shortwaveRadiation = 0,
    apparentTemp = 20,
    precipProbability = 0,
    cloudCover = 0,
    windGusts = 0,
    isDay = 1,
  } = weather;
  // 1. Solar component (0–35): shortwave radiation peaks ~900 W/m²
  const solarScore = isDay ? Math.min(35, Math.round((shortwaveRadiation / 900) * 35)) : 0;
  // 2. Comfort component (0–30): bell curve peaking at 22°C
  const tempDelta = Math.abs(apparentTemp - 22);
  const comfortScore = Math.max(0, Math.round(30 - (tempDelta * tempDelta * 0.35)));
  // 3. Rain penalty (0–20 deducted): linear above 10%
  const rainPenalty = Math.min(20, Math.round(Math.max(0, precipProbability - 10) * 0.25));
  // 4. Cloud penalty (0–10 deducted): kicks in above 40% cloud cover
  const cloudPenalty = Math.min(10, Math.round(Math.max(0, cloudCover - 40) * 0.18));
  // 5. Wind penalty (0–5 deducted): above 30 km/h gusts
  const windKmh = windGusts > 10 ? windGusts : windGusts * 3.6; // handle m/s vs km/h
  const windPenalty = Math.min(5, Math.round(Math.max(0, windKmh - 30) * 0.15));
  const raw = solarScore + comfortScore - rainPenalty - cloudPenalty - windPenalty;
  const score = Math.max(0, Math.min(100, raw));
  return {
    score,
    ...getSunScoreLabel(score),
    breakdown: {
      solarScore,
      comfortScore,
      rainPenalty,
      cloudPenalty,
      windPenalty,
    },
  };
}
/**
 * Quick single-number helper for use in venue list sorting.
 * @param {object} weather - output from getMelbourneWeather()
 * @returns {number} 0–100
 */
export function getLiveScore(weather) {
  return calculateLiveSunScore(weather).score;
}
// ─── STATIC SCORE (venue data fallback) ────────────────────────────────────
/**
 * Original static SunScore using venue seasonal data.
 * Used as fallback when live weather is unavailable.
 * 
 * Formula:
 *   Base Hours = (0.6 * summerHours) + (0.4 * winterHours)
 *   Base Score = Math.min(Base Hours * 10, 80)
 *   UseCase Bonus: +10 for "Morning coffee" or "Sunset drinks"
 *   Obstruction Penalty: -10 Partial, -20 Heavy
 */
export function calculateSunScore(summerHours, winterHours, useCase, obstructionLevel, orientation) {
  const validOrientations = ['N','NE','E','SE','S','SW','W','NW'];
  const verifiedOrientation = validOrientations.includes(orientation) ? orientation : 'S';
  void verifiedOrientation;
  const obstructionMap = { Open: 0, Partial: 1, Heavy: 2 };
  const obstruction = obstructionMap[obstructionLevel] || 0;
  const baseHours = (0.6 * summerHours) + (0.4 * winterHours);
  const baseScore = Math.min(baseHours * 10, 80);
  const useCaseBonus = ['Morning coffee', 'Sunset drinks'].includes(useCase) ? 10 : 0;
  const obstructionPenalty = obstruction * 10;
  const raw = baseScore + useCaseBonus - obstructionPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
// ─── LABELS (shared) ───────────────────────────────────────────────────────
export function getSunScoreLabel(score) {
  if (score >= 80) return { label: 'Exceptional Sun ☀️',  color: '#F59E0B' };
  if (score >= 65) return { label: 'Great Conditions 🌤️', color: '#34D399' };
  if (score >= 45) return { label: 'Moderate Sun ⛅',     color: '#94A3B8' };
  if (score >= 25) return { label: 'Low Sun ☁️',          color: '#64748B' };
  return               { label: 'Cosy Indoors 🛋️',       color: '#818CF8' };
}
/**
 * Venue comfort tier for UI badges and map pin sorting.
 * @param {number} score
 * @returns {'prime' | 'good' | 'moderate' | 'cosy'}
 */
export function getComfortTier(score) {
  if (score >= 80) return 'prime';
  if (score >= 65) return 'good';
  if (score >= 45) return 'moderate';
  return 'cosy';
}
