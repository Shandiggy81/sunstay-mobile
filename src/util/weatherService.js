// src/util/weatherService.js

const CACHE_KEY = "sunstay_openmeteo_cache";
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
const memoryCache = { data: null, timestamp: 0 }; // fallback if localStorage unavailable

export async function getMelbourneWeather() {
  const lat = -37.8136;
  const lng = 144.9631;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code,uv_index,is_day,apparent_temperature&hourly=temperature_2m,apparent_temperature,direct_normal_irradiance,shortwave_radiation,sunshine_duration,cloud_cover,cloud_cover_low,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability,showers,weather_code&daily=sunrise,sunset,uv_index_max,temperature_2m_min,temperature_2m_max,daylight_duration&timezone=Australia%2FMelbourne&forecast_days=1&wind_speed_unit=ms`;

  // Try localStorage cache first, fall back to memory cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) return parsed.data;
    }
  } catch (e) {
    if (memoryCache.data && Date.now() - memoryCache.timestamp < CACHE_DURATION_MS) {
      return memoryCache.data;
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response was not ok");
    const data = await res.json();

    const now = new Date();
    const currentHour = Math.min(23, now.getHours());

    const result = {
      // Current conditions
      temperature: data.current.temperature_2m,
      apparentTemp: data.current.apparent_temperature ?? null,
      windSpeed: data.current.wind_speed_10m,
      weatherCodeCurrent: data.current.weather_code,
      uvIndex: data.current.uv_index,
      isDay: data.current.is_day ?? 1,

      // Daily
      sunrise: data.daily.sunrise[0],
      sunset: data.daily.sunset[0],
      minTemp: data.daily.temperature_2m_min[0],
      maxTemp: data.daily.temperature_2m_max?.[0] ?? null,
      uvIndexMax: data.daily.uv_index_max?.[0] ?? null,
      daylightDuration: data.daily.daylight_duration?.[0] ?? null, // seconds

      // Hourly snapshot at current hour
      weatherCode: data.hourly.weather_code?.[currentHour] ?? null,
      precipitation: data.hourly.precipitation?.[currentHour] ?? null,
      precipProbability: data.hourly.precipitation_probability?.[currentHour] ?? null,
      windGusts: data.hourly.wind_gusts_10m?.[currentHour] ?? null,
      showerMm: data.hourly.showers?.[currentHour] ?? null,
      cloudCover: data.hourly.cloud_cover?.[currentHour] ?? null,
      cloudCoverLow: data.hourly.cloud_cover_low?.[currentHour] ?? null,
      sunshineDuration: data.hourly.sunshine_duration?.[currentHour] ?? null, // seconds
      shortwaveRadiation: data.hourly.shortwave_radiation?.[currentHour] ?? null, // W/m²
      directNormalIrradiance: data.hourly.direct_normal_irradiance?.[currentHour] ?? null,

      // Sun score (0–100) based on shortwave radiation (max ~800 W/m²)
      sunScore: Math.min(100, Math.round((data.hourly.shortwave_radiation?.[currentHour] ?? 0) / 8)),

      // Full hourly arrays for charts/graphs
      hourlyData: data.hourly,
    };

    // Write to localStorage, fall back to memory
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: result }));
    } catch (e) {
      memoryCache.data = result;
      memoryCache.timestamp = Date.now();
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch weather data", error);
    return {
      temperature: 22, apparentTemp: 22, windSpeed: 10,
      weatherCodeCurrent: 0, weatherCode: 0,
      uvIndex: 5, uvIndexMax: 6, isDay: 1,
      sunrise: new Date().toISOString(), sunset: new Date().toISOString(),
      minTemp: 15, maxTemp: 24, daylightDuration: 43200,
      precipitation: 0, precipProbability: 0,
      windGusts: null, showerMm: 0,
      cloudCover: 10, cloudCoverLow: 5,
      sunshineDuration: 3600, shortwaveRadiation: 600,
      directNormalIrradiance: 500, sunScore: 75,
      hourlyData: {
        time: Array(24).fill(new Date().toISOString()),
        temperature_2m: Array(24).fill(22),
        apparent_temperature: Array(24).fill(22),
        direct_normal_irradiance: Array(24).fill(0),
        shortwave_radiation: Array(24).fill(0),
        sunshine_duration: Array(24).fill(0),
        cloud_cover: Array(24).fill(10),
        cloud_cover_low: Array(24).fill(5),
        wind_speed_10m: Array(24).fill(10),
        wind_gusts_10m: Array(24).fill(12),
        precipitation: Array(24).fill(0),
        precipitation_probability: Array(24).fill(0),
      },
      loadingMessage: "Loading sun data..."
    };
  }
}

export function mapWeatherCode(wmoCode) {
  if (wmoCode === 0) return { label: 'Clear', icon: '☀️' };
  if (wmoCode === 1 || wmoCode === 2) return { label: 'Partly Cloudy', icon: '⛅' };
  if (wmoCode === 3) return { label: 'Overcast', icon: '☁️' };
  if (wmoCode >= 45 && wmoCode <= 48) return { label: 'Fog', icon: '🌫️' };
  if (wmoCode >= 51 && wmoCode <= 67) return { label: 'Rain', icon: '🌧️' };
  if (wmoCode >= 71 && wmoCode <= 77) return { label: 'Snow', icon: '❄️' };
  if (wmoCode >= 80 && wmoCode <= 82) return { label: 'Showers', icon: '🌦️' };
  if (wmoCode >= 95) return { label: 'Thunderstorm', icon: '⛈️' };
  return { label: 'Unknown', icon: '🌤️' };
}

// Comfort level helper — uses apparentTemp + wind + rain
export function getComfortLevel({ apparentTemp, precipProbability, windGusts }) {
  if (precipProbability > 60) return { label: 'Wet', icon: '🌧️', cozy: true };
  if (apparentTemp < 12) return { label: 'Cold', icon: '🧥', cozy: true };
  if (windGusts > 15) return { label: 'Windy', icon: '💨', cozy: false };
  if (apparentTemp >= 18 && apparentTemp <= 28) return { label: 'Comfortable', icon: '😊', cozy: false };
  if (apparentTemp > 28) return { label: 'Hot', icon: '🥵', cozy: false };
  return { label: 'Mild', icon: '🌤️', cozy: false };
}
