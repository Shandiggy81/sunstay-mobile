/**
 * useWeather (hook) — thin re-export of WeatherContext.
 * Previously made its own Open-Meteo fetch with local caching.
 * Now delegates entirely to WeatherContext which owns the
 * single shared fetch + 15-minute cache.
 *
 * Returns { weather, loading, theme, liveSunScore, ... }
 * matching the WeatherContext value shape.
 */
export { useWeather } from '../context/WeatherContext';
