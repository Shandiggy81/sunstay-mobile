/**
 * Overview Sunstay Score — WeatherContext getSunstayScoreResult only.
 * Ignores weather.score, solarMath, solarCalculator, and getSunData so the
 * badge cannot disagree with the TOD-aware context score mid-pitch.
 */
export function resolveOverviewScore({
  loading = false,
  getSunstayScoreResult,
  venue,
} = {}) {
  if (loading) {
    return { score: null, label: null, unavailable: false, loading: true };
  }

  if (typeof getSunstayScoreResult !== 'function') {
    return { score: null, label: 'Score unavailable', unavailable: true, loading: false };
  }

  const result = getSunstayScoreResult(venue) || {};
  if (result.unavailable || !Number.isFinite(result.score)) {
    return {
      score: null,
      label: result.label || 'Score unavailable',
      unavailable: true,
      loading: false,
    };
  }

  return {
    score: result.score,
    label: result.label || null,
    unavailable: false,
    loading: false,
  };
}
