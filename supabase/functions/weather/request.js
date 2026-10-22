// Keep the Edge Function self-contained; a test checks these against mapBounds.js.
export const WEATHER_BOUNDS = Object.freeze([[144.5, -38.2], [145.5, -37.5]]);
export const CACHE_TTL_MS = Object.freeze({ forecast: 10 * 60_000, hourly: 10 * 60_000, air: 30 * 60_000 });

// These are the existing browser requests. Air serves both current and hourly
// PM2.5 readers without allowing callers to choose extra upstream parameters.
const PARAMETERS = Object.freeze({
  forecast: {
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,uv_index,is_day,shortwave_radiation,surface_pressure',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,uv_index,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,wind_speed_10m_max',
    timezone: 'Australia/Melbourne', forecast_days: '2', wind_speed_unit: 'kmh',
  },
  hourly: {
    hourly: 'temperature_2m,apparent_temperature,weather_code,weathercode,precipitation_probability,cloud_cover,cloudcover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,windgusts_10m,precipitation,visibility,sunshine_duration,shortwave_radiation,direct_normal_irradiance',
    timezone: 'auto', forecast_days: '1', wind_speed_unit: 'kmh',
  },
  air: { current: 'pm2_5', hourly: 'pm2_5', timezone: 'auto', forecast_days: '1' },
});

function coordinate(value) {
  // Reject blanks, hexadecimal, lists, NaN and Infinity rather than coercing them.
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseWeatherRequest(params) {
  const kind = params.get('kind');
  if (!Object.hasOwn(PARAMETERS, kind)) return { ok: false, status: 400, error: 'invalid_kind' };
  const lat = coordinate(params.get('lat'));
  const lng = coordinate(params.get('lng'));
  if (lat === null || lng === null) return { ok: false, status: 400, error: 'invalid_coordinates' };
  const [[west, south], [east, north]] = WEATHER_BOUNDS;
  if (lng < west || lng > east || lat < south || lat > north) {
    return { ok: false, status: 400, error: 'outside_bounds' };
  }
  const query = { kind, lat: lat.toFixed(2), lng: lng.toFixed(2) };
  return { ok: true, query, cacheKey: `${kind}:${query.lat},${query.lng}`, ttlMs: CACHE_TTL_MS[kind] };
}

export function weatherUrl(query, apiKey = '') {
  const air = query.kind === 'air';
  const host = air ? 'air-quality-api.open-meteo.com' : 'api.open-meteo.com';
  // Open-Meteo's commercial docs prefix the API host with "customer-", including
  // air quality: https://open-meteo.com/en/docs/air-quality-api#api_documentation
  const url = new URL(`https://${apiKey ? 'customer-' : ''}${host}/v1/${air ? 'air-quality' : 'forecast'}`);
  url.search = new URLSearchParams({ latitude: query.lat, longitude: query.lng, ...PARAMETERS[query.kind] }).toString();
  if (apiKey) url.searchParams.set('apikey', apiKey);
  return url.toString();
}

// Shared within an isolate, bounded, and lost when the instance restarts.
export function createCache(maxEntries = 500) {
  const entries = new Map();
  return {
    get(key, now = Date.now()) {
      const hit = entries.get(key);
      if (!hit) return null;
      if (now >= hit.expiresAt) { entries.delete(key); return null; }
      return hit.value;
    },
    set(key, value, ttlMs, now = Date.now()) {
      if (!entries.has(key) && entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, { value, expiresAt: now + ttlMs });
    },
  };
}
