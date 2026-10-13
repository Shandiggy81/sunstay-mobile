/**
 * Venue filter rules used by App's filteredVenues.
 */

// Practical needs a guest can't do without: every one selected must match.
// All other tag filters (venue types and vibes) match if any of them does.
export const PRACTICAL_NEED_TAGS = Object.freeze([
  'Pet Friendly',
  'Pram Friendly',
  'Wheelchair Accessible',
  'Large Groups',
  'Smoking Area',
  'Vegan',
]);

const NEEDS = new Set(PRACTICAL_NEED_TAGS.map((tag) => tag.toLowerCase()));

/**
 * @param {object} venue
 * @param {string[]} filterIds Selected tag filter ids (FILTER_CATEGORIES[].id).
 * @param {(venue: object, id: string) => boolean} matchesTag
 */
export function matchesTagFilters(venue, filterIds, matchesTag) {
  if (!Array.isArray(filterIds) || filterIds.length === 0) return true;
  const needs = filterIds.filter((id) => NEEDS.has(String(id).toLowerCase()));
  const types = filterIds.filter((id) => !NEEDS.has(String(id).toLowerCase()));
  if (!needs.every((id) => matchesTag(venue, id))) return false;
  return types.length === 0 || types.some((id) => matchesTag(venue, id));
}

// Same cut-off the map uses for a sunny pin (microclimate pinStateFromMicroclimate
// calls 0.4+ "sunny"); half the hour in sun is the bar for "direct sun".
export const DIRECT_SUN_FRACTION = 0.5;

/**
 * Forecast kind ('sun' | 'cloud' | 'rain' | 'night' | 'day') for the hour of
 * `minutes` (Melbourne minutes past midnight), or for now when minutes is null.
 *
 * @param {ReturnType<import('./sunForecastState.js').deriveSunForecast>|null} forecast
 * @param {number|null} minutes
 */
export function forecastKindAt(forecast, minutes) {
  if (!forecast?.hours) return null;
  const hour = Number.isFinite(minutes)
    ? Math.floor((((Math.round(minutes) % 1440) + 1440) % 1440) / 60)
    : Math.floor(forecast.nowHour);
  return forecast.hours[hour]?.kind ?? null;
}

/**
 * Whether the "Sunny" filter keeps a venue: its own sun reading at the
 * selected time says direct sun, and the forecast for that hour isn't cloud,
 * rain or night. Melbourne's UV index plays no part (it's safety info).
 * With no reading and no forecast the venue is kept rather than hidden on a
 * guess.
 *
 * @param {{ sunFraction?: number|null }|null} reading readMicroclimate() result
 * @param {string|null} forecastKind forecastKindAt() result
 * @param {boolean} [roofClosed]
 */
export function isVenueInDirectSun({ reading = null, forecastKind = null, roofClosed = false } = {}) {
  if (roofClosed) return false;
  if (forecastKind === 'rain' || forecastKind === 'cloud' || forecastKind === 'night') return false;
  const fraction = reading?.sunFraction;
  if (typeof fraction === 'number' && Number.isFinite(fraction)) return fraction >= DIRECT_SUN_FRACTION;
  return forecastKind === 'sun' || forecastKind == null || forecastKind === 'day';
}
