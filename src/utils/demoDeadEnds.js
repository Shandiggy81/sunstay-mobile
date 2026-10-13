/**
 * Demo controls that have no working outcome yet. Each stays in the code so it
 * can come back once it does something real.
 */

/** "Your filters" in the filter sheet saved text but filtered nothing. */
export const SHOW_CUSTOM_FILTERS = false;

/** "Guarantee available": there is no purchase or refund flow behind it yet. */
export const SHOW_WEATHER_GUARANTEE = false;

/** Shown after someone picks or takes a photo with "Capture the Vibe". */
export const PHOTO_COMING_SOON_MESSAGE = '📸 Photo sharing is coming soon — nothing was uploaded.';

/**
 * Where the venue card's "Xh direct sun" number came from:
 * - 'forecast': today's hourly forecast (same as the Sun Forecast tab)
 * - 'curve': the venue's sun curve from the database
 * - 'estimate': neither was available, so the number is a placeholder
 */
export function sunHoursSource({ hasForecast = false, hasCurve = false } = {}) {
    if (hasForecast) return 'forecast';
    if (hasCurve) return 'curve';
    return 'estimate';
}
