// Raw Open-Meteo response, so the app's real weather parsing still runs.
export const NOW = new Date('2026-10-19T00:00:00Z'); // 11am Melbourne
const days = ['2026-10-19', '2026-10-20'];
const time = days.flatMap(day => Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, '0')}:00`));
const fill = value => time.map(() => value);

export const weather = {
  latitude: -37.8136,
  longitude: 144.9631,
  utc_offset_seconds: 39600,
  timezone: 'Australia/Melbourne',
  current: {
    time: '2026-10-19T11:00', temperature_2m: 23, apparent_temperature: 22,
    relative_humidity_2m: 50, precipitation: 0, weather_code: 0,
    wind_speed_10m: 7.2, wind_direction_10m: 180, wind_gusts_10m: 10,
    cloud_cover: 0, uv_index: 4, is_day: 1, shortwave_radiation: 900, surface_pressure: 1015,
  },
  hourly: {
    time, temperature_2m: fill(23), apparent_temperature: fill(22),
    precipitation_probability: fill(0), precipitation: fill(0), weather_code: fill(0),
    cloud_cover: fill(0), wind_speed_10m: fill(7.2), wind_direction_10m: fill(180),
    wind_gusts_10m: fill(10), shortwave_radiation: fill(900), uv_index: fill(4),
    is_day: time.map(value => { const hour = Number(value.slice(11, 13)); return hour >= 7 && hour <= 19 ? 1 : 0; }),
  },
  daily: {
    time: days, weather_code: [0, 0], temperature_2m_max: [24, 24], temperature_2m_min: [15, 15],
    sunrise: days.map(day => `${day}T06:22`), sunset: days.map(day => `${day}T19:44`),
    uv_index_max: [5, 5], precipitation_sum: [0, 0], wind_speed_10m_max: [10, 10],
  },
};
