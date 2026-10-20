/**
 * Pin state that comes from a venue's own features (heaters, fireplace), not
 * from weather, so it stays truthful when weather is missing, failed or demo.
 * `liveFeatures` is the venue's entry from the live venue-feature map.
 * Returns 'heater', or null when no feature applies.
 */
export function venueFeaturePinState(venue, liveFeatures) {
    const live = liveFeatures || {};
    if (live.heatersOn || live.fireplaceOn || venue?.heatersOn || venue?.fireplaceOn) return 'heater';
    return null;
}
