import SunCalc from 'suncalc';
import { DEFAULT_TIME_ZONE, venueLocalDate } from './balconySunEngine.js';
import { venueHour, venueTimeAt } from './venueTime.js';
import { formatHour } from './sunForecastState.js';

/**
 * Calculates a useful visible sun window for a given location.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {{ now?: Date, timeZone?: string }} [options] Venue clock and day.
 * @returns {{startHour: number, endHour: number, text: string}|null}
 */
export function getSunData(lat, lng, { now = new Date(), timeZone = DEFAULT_TIME_ZONE } = {}) {
  // Return null if lat or lng is missing or invalid
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
    return null;
  }

  // Ask for the venue's calendar day, even when the viewer is on another day.
  const noon = venueTimeAt(venueLocalDate(now, timeZone), 12, timeZone);
  const times = SunCalc.getTimes(noon, lat, lng);

  // Use a useful "daylight" window. Fallback from sunrise/sunset to dawn/dusk.
  const valid = date => date instanceof Date && Number.isFinite(date.getTime());
  const startTime = [times.sunrise, times.dawn].find(valid);
  const endTime = [times.sunset, times.dusk].find(valid);

  // If even the fallbacks are missing, we can't calculate.
  if (!startTime || !endTime) {
    return null;
  }

  const startHour = venueHour(startTime, timeZone);
  const endHour = venueHour(endTime, timeZone);
  
  // Final safety check
  if (startTime >= endTime) {
    return null;
  }

  return {
    startHour,
    endHour,
    text: `Sun from ${formatHour(startHour)} to ${formatHour(endHour)}`,
    sunriseDate: startTime,
    sunsetDate: endTime,
  };
}
