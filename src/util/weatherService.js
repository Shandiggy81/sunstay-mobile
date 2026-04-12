// src/util/weatherService.js — MUST exist

const CACHE_KEY = "sunstay_openmeteo_cache";
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function getMelbourneWeather() {
  const lat = -37.8136;
  const lng = 144.9631;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code,uv_index&hourly=temperature_2m,direct_normal_irradiance,sunshine_duration,cloud_cover_low,wind_speed_10m,precipitation,wind_gusts_10m,showers,weather_code&daily=sunrise,sunset,uv_index_max,temperature_2m_min&timezone=Australia%2FMelbourne&forecast_days=1&wind_speed_unit=ms`;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
        return parsed.data;
      }
    }
  } catch (e) {
    console.warn("Cache read failed", e);
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response was not ok");
    const data = await res.json();
    
    const now = new Date();
    const currentHour = Math.min(23, now.getHours());
    
    const result = {
      temperature: data.current.temperature_2m,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
      sunrise: data.daily.sunrise[0],
      sunset: data.daily.sunset[0],
      uvIndex: data.current.uv_index,
      minTemp: data.daily.temperature_2m_min[0],
      precipitation: data.hourly.precipitation[currentHour],
      windGusts: data.hourly.wind_gusts_10m?.[currentHour] ?? null,
      rainMm: data.hourly.precipitation?.[currentHour] ?? null,
      showerMm: data.hourly.showers?.[currentHour] ?? null,
      weatherCode: data.hourly.weather_code?.[currentHour] ?? null,
      sunScore: Math.min(100, Math.round(data.hourly.direct_normal_irradiance[currentHour] / 8)),
      hourlyData: data.hourly
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: result
      }));
    } catch (e) {
      console.warn("Cache write failed", e);
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch weather data", error);
    // Graceful fallback
    return {
      temperature: 22, windSpeed: 10, weatherCode: 0,
      sunrise: new Date().toISOString(), sunset: new Date().toISOString(),
      uvIndex: 5, sunScore: 75,
      hourlyData: {
        time: Array(24).fill(new Date().toISOString()),
        temperature_2m: Array(24).fill(22),
        direct_normal_irradiance: Array(24).fill(0),
        sunshine_duration: Array(24).fill(0),
        cloud_cover_low: Array(24).fill(0),
        wind_speed_10m: Array(24).fill(10),
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
