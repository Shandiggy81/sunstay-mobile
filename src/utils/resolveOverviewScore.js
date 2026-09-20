/**
 * Overview Sunstay Score — same number the map pin shows for this venue.
 *
 * When a `venues_in_bbox` row exists, the score is `resolveSunFraction` at
 * the slider's `todMinutes` (via `markerScoreFromMicroclimate`), so the
 * sheet cannot disagree with the active marker. WeatherContext
 * `getSunstayScoreResult` is a soft fallback for venues with no RPC profile.
 */
import {
  markerScoreFromMicroclimate,
  readMicroclimate,
} from './microclimate.js';

export function resolveOverviewScore({
  loading = false,
  getSunstayScoreResult,
  venue,
  microclimateEntry = null,
  todMinutes = null,
  now,
} = {}) {
  const reading = readMicroclimate(microclimateEntry, todMinutes, now);
  const profileScore = markerScoreFromMicroclimate(reading);
  if (profileScore != null) {
    return {
      score: profileScore,
      label: reading.sunLabel || null,
      unavailable: false,
      loading: false,
    };
  }

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
