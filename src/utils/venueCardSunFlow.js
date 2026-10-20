/**
 * Pick one main sun section; keep the timeline while richer data is absent.
 * Cafés with today's building-shaded sun get the café sun card instead of
 * the generic sun moments.
 */
export function venueCardSunSection({ showStay, outdoorDay, outdoorMoments, cafe = false }) {
  if (showStay) return 'stay';
  if (outdoorDay && outdoorMoments) return cafe ? 'cafe' : 'moments';
  return 'today';
}
