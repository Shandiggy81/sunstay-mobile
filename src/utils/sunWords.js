/** Plain words for how high the sun is, instead of altitude/azimuth degrees. */
export function describeSunHeight(sun) {
    if (!sun || !sun.isSunUp) return 'The sun has set.';
    const altitude = Number(sun.altitude);
    if (sun.altitude == null || !Number.isFinite(altitude)) return 'The sun is up.';
    if (altitude < 15) return 'Low in the sky — long shadows, easily blocked by buildings.';
    if (altitude < 40) return 'Halfway up the sky — sunny spots depend on what is nearby.';
    return 'High in the sky — most open terraces get sun.';
}
