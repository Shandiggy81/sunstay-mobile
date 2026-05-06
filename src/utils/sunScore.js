/**
 * Sunstay Score Engine v2.1
 *
 * LIVE score: uses real-time Open-Meteo data (primary)
 * STATIC score: uses venue seasonal hours + obstruction (fallback)
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
    uvIndex = null,
  } = weather;

  const solarScore = isDay ? Math.min(30, Math.round((shortwaveRadiation / 900) * 30)) : 0;
  const uvScore = isDay && uvIndex != null
    ? Math.min(15, Math.round((Math.min(uvIndex, 11) / 11) * 15))
    : isDay ? 7 : 0;
  const tempDelta = Math.abs(apparentTemp - 22);
  const comfortScore = Math.max(0, Math.round(25 - (tempDelta * tempDelta * 0.3)));
  const rainPenalty = Math.min(15, Math.round(Math.max(0, precipProbability - 10) * 0.2));
  const cloudPenalty = Math.min(10, Math.round(Math.max(0, cloudCover - 40) * 0.18));
  const windKmh = windGusts > 10 ? windGusts : windGusts * 3.6;
  const windPenalty = Math.min(5, Math.round(Math.max(0, windKmh - 30) * 0.15));

  const raw = solarScore + uvScore + comfortScore - rainPenalty - cloudPenalty - windPenalty;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    ...getSunScoreLabel(score),
    breakdown: { solarScore, uvScore, comfortScore, rainPenalty, cloudPenalty, windPenalty },
  };
}

export function getLiveScore(weather) {
  return calculateLiveSunScore(weather).score;
}

export function calculateSunScore(summerHours, winterHours, useCase, obstructionLevel, orientation) {
  const validOrientations = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
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

export function getSunScoreLabel(score) {
  if (score >= 80) return { label: 'Exceptional Sun \u2600\uFE0F',    color: '#F59E0B' };
  if (score >= 65) return { label: 'Great Conditions \uD83C\uDF24\uFE0F', color: '#34D399' };
  if (score >= 45) return { label: 'Moderate Sun \u26C5',              color: '#94A3B8' };
  if (score >= 25) return { label: 'Low Sun \u2601\uFE0F',              color: '#64748B' };
  return               { label: 'Cosy Indoors \uD83D\uDECB\uFE0F',    color: '#818CF8' };
}

export function getComfortTier(score) {
  if (score >= 80) return 'prime';
  if (score >= 65) return 'good';
  if (score >= 45) return 'moderate';
  return 'cosy';
}
