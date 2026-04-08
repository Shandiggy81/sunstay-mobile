import SunCalc from 'suncalc';

/**
 * Calculates a useful visible sun window for a given location.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {{startHour: number, endHour: number, text: string}|null}
 */
export function getSunData(lat, lng) {
  // Return null if lat or lng is missing or invalid
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  const now = new Date();
  const times = SunCalc.getTimes(now, lat, lng);

  // Use a useful "daylight" window. Fallback from sunrise/sunset to dawn/dusk.
  const startTime = times.sunrise || times.dawn;
  const endTime = times.sunset || times.dusk;

  // If even the fallbacks are missing, we can't calculate.
  if (!startTime || !endTime) {
    return null;
  }

  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const endHour = endTime.getHours() + endTime.getMinutes() / 60;
  
  // Final safety check
  if (startHour >= endHour) {
    return null;
  }

  const formatTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');

  return {
    startHour,
    endHour,
    text: `Sun from ${formatTime(startTime)} to ${formatTime(endTime)}`,
  };
}
