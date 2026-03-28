// Sunstay Weather Service
// Fetches live weather data from OpenWeather API

const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';
const API_KEY = import.meta.env.VITE_OPENWEATHER_KEY;

/**
 * Get current weather for a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export async function getCurrentWeather(lat, lng) {
  const res = await fetch(
    `${BASE_URL}/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
  );
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Get hourly forecast for a location (next 12 hours)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export async function getHourlyForecast(lat, lng) {
  const res = await fetch(
    `${ONE_CALL_URL}?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&exclude=minutely,daily,alerts`
  );
  if (!res.ok) throw new Error(`Forecast fetch failed: ${res.status}`);
  const data = await res.json();
  return data.hourly?.slice(0, 12) || [];
}

/**
 * Calculate Sunstay Score (0-100) based on weather conditions
 * Higher score = better outdoor conditions for venues
 * @param {object} weatherData - OpenWeather current weather response
 * @param {number} uvIndex - UV index (0-11+)
 */
export function getSunstayScore(weatherData, uvIndex = 5) {
  const clouds = weatherData?.clouds?.all ?? 50;
  const windSpeed = weatherData?.wind?.speed ?? 0;
  const rain = weatherData?.rain?.['1h'] ?? 0;

  // Penalise for heavy wind (>10 m/s) and rain
  const windPenalty = Math.min(windSpeed / 10 * 15, 15);
  const rainPenalty = rain > 0 ? 20 : 0;

  const score = Math.round(
    (1 - clouds / 100) * 60 +
    (Math.min(uvIndex, 11) / 11) * 25 -
    windPenalty -
    rainPenalty
  );

  return Math.max(0, Math.min(100, score));
}

/**
 * Get score label and emoji for display
 * @param {number} score - Sunstay score 0-100
 */
export function getScoreLabel(score) {
  if (score >= 80) return { label: 'Perfect', emoji: '☀️', color: 'text-amber-400' };
  if (score >= 60) return { label: 'Great', emoji: '🌤️', color: 'text-yellow-400' };
  if (score >= 40) return { label: 'Decent', emoji: '⛅', color: 'text-orange-400' };
  if (score >= 20) return { label: 'Cloudy', emoji: '🌥️', color: 'text-gray-400' };
  return { label: 'Stay In', emoji: '🌧️', color: 'text-blue-400' };
}
