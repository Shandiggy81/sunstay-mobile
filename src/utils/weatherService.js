// src/utils/weatherService.js

export const toUnixTimestamp = (isoDateTime) => {
    if (!isoDateTime) return null;
    const ms = Date.parse(isoDateTime);
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
};

export const getWeatherFromOpenMeteoCode = (code) => {
    if (code === 0) return { main: 'Clear', description: 'clear sky', icon: '01d' };
    if ([1].includes(code)) return { main: 'Clouds', description: 'mostly clear', icon: '02d' };
    if ([2].includes(code)) return { main: 'Clouds', description: 'partly cloudy', icon: '03d' };
    if ([3].includes(code)) return { main: 'Clouds', description: 'overcast', icon: '04d' };
    if ([45, 48].includes(code)) return { main: 'Fog', description: 'foggy', icon: '50d' };
    if ([51, 53, 55, 56, 57].includes(code)) return { main: 'Drizzle', description: 'drizzle', icon: '09d' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { main: 'Rain', description: 'rain showers', icon: '10d' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { main: 'Snow', description: 'snow', icon: '13d' };
    if ([95, 96, 99].includes(code)) return { main: 'Thunderstorm', description: 'thunderstorm', icon: '11d' };
    return { main: 'Clouds', description: 'variable cloud', icon: '03d' };
};

export const getThemeFromCondition = (condition) => {
    if (condition.includes('rain') || condition.includes('drizzle')) return 'rainy';
    if (condition.includes('cloud') || condition.includes('fog')) return 'cloudy';
    if (condition.includes('wind') || condition.includes('gale')) return 'windy';
    return 'sunny';
};

export const fetchOpenMeteoWeather = async (lat, lon, signal) => {
    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'precipitation',
            'weather_code',
            'wind_speed_10m',
            'wind_gusts_10m',
            'cloud_cover',
            'uv_index',
            'is_day',
            'shortwave_radiation',
            'surface_pressure',
        ].join(','),
        hourly: [
            'temperature_2m',
            'apparent_temperature',
            'precipitation_probability',
            'weather_code',
            'cloud_cover',
            'wind_speed_10m',
            'wind_gusts_10m',
            'shortwave_radiation',
            'uv_index',
            'is_day',
        ].join(','),
        daily: [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'sunrise',
            'sunset',
            'uv_index_max',
            'precipitation_sum',
            'wind_speed_10m_max',
        ].join(','),
        timezone: 'Australia/Melbourne',
        forecast_days: '2',
        wind_speed_unit: 'kmh',
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const data = await response.json();

    const current = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    const wmoCode = current.weather_code ?? 0;
    const weatherDesc = getWeatherFromOpenMeteoCode(wmoCode);

    // Derive sunrise/sunset unix from daily ISO strings
    const sunriseUnix = toUnixTimestamp(daily.sunrise?.[0]);
    const sunsetUnix = toUnixTimestamp(daily.sunset?.[0]);

    return {
        main: {
            temp: current.temperature_2m ?? 20,
            feels_like: current.apparent_temperature ?? 20,
            humidity: current.relative_humidity_2m ?? 50,
        },
        weather: [weatherDesc],
        wind: { speed: (current.wind_speed_10m ?? 0) / 3.6 }, // convert kmh → m/s
        clouds: { all: current.cloud_cover ?? 0 },
        uvi: current.uv_index ?? 0,
        sys: {
            sunrise: sunriseUnix,
            sunset: sunsetUnix,
        },
        name: 'Melbourne',
        source: 'open-meteo',
        theme: getThemeFromCondition(weatherDesc.description),
        isDay: current.is_day === 1,
        shortwaveRadiation: current.shortwave_radiation ?? 0,
        windGusts: current.wind_gusts_10m ?? 0,
        hourly: {
            ...hourly,
            _tzOffsetSeconds: 36000, // AEST = UTC+10
        },
        daily,
    };
};

export function mapWeatherCode(wmoCode) {
  if (wmoCode === 0) return { label: 'Clear', icon: '\u2600\uFE0F' };
  if (wmoCode === 1 || wmoCode === 2) return { label: 'Partly Cloudy', icon: '\u26C5' };
  if (wmoCode === 3) return { label: 'Overcast', icon: '\u2601\uFE0F' };
  if (wmoCode >= 45 && wmoCode <= 48) return { label: 'Fog', icon: '\uD83C\uDF2B\uFE0F' };
  if (wmoCode >= 51 && wmoCode <= 67) return { label: 'Rain', icon: '\uD83C\uDF27\uFE0F' };
  if (wmoCode >= 71 && wmoCode <= 77) return { label: 'Snow', icon: '\u2744\uFE0F' };
  if (wmoCode >= 80 && wmoCode <= 82) return { label: 'Showers', icon: '\uD83C\uDF26\uFE0F' };
  if (wmoCode >= 95) return { label: 'Thunderstorm', icon: '\u26C8\uFE0F' };
  return { label: 'Unknown', icon: '\uD83C\uDF24\uFE0F' };
}

export function getComfortLevel({ apparentTemp, precipProbability, windGusts }) {
  if (precipProbability > 60) return { label: 'Wet', icon: '\uD83C\uDF27\uFE0F', cozy: true };
  if (apparentTemp < 12) return { label: 'Cold', icon: '\uD83E\uDDE5', cozy: true };
  if (windGusts > 15) return { label: 'Windy', icon: '\uD83D\uDCA8', cozy: false };
  if (apparentTemp >= 18 && apparentTemp <= 28) return { label: 'Comfortable', icon: '\uD83D\uDE0A', cozy: false };
  if (apparentTemp > 28) return { label: 'Hot', icon: '\uD83E\uDD75', cozy: false };
  return { label: 'Mild', icon: '\uD83C\uDF24\uFE0F', cozy: false };
}
