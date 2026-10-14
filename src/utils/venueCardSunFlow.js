/** Pick one main sun section; keep the timeline while richer data is absent. */
export function venueCardSunSection({ showStay, outdoorDay, outdoorMoments }) {
  if (showStay) return 'stay';
  if (outdoorDay && outdoorMoments) return 'moments';
  return 'today';
}
