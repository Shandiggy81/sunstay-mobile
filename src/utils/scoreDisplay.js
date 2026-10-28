/**
 * What the sun-score badge shows. A sun score is the venue's direct sun; at
 * night it is always 0 and while it rains it is near 0, and either number
 * reads like a bad venue. So the badge says "Night" or "Rain" instead.
 *
 * @param {{ isNight?: boolean, skyKind?: string|null }} input
 *   skyKind: the forecast kind ('sun' | 'cloud' | 'rain' | ...) at the
 *   score's own time, e.g. forecastKindAt(forecast, todMinutes).
 * @returns {'night'|'rain'|'score'}
 */
export function scoreDisplayState({ isNight = false, skyKind = null } = {}) {
    if (isNight) return 'night';
    if (skyKind === 'rain') return 'rain';
    return 'score';
}
