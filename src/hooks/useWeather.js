import { useState, useEffect, useCallback } from 'react';
import { getCurrentWeather, getHourlyForecast, getSunstayScore, getScoreLabel } from '../api/weatherService';

// Default to Melbourne CBD
const DEFAULT_LAT = -37.8136;
const DEFAULT_LNG = 144.9631;

/**
 * useWeather hook — fetches live weather and computes Sunstay score
 * @param {number} lat - Latitude (defaults to Melbourne)
 * @param {number} lng - Longitude (defaults to Melbourne)
 */
export function useWeather(lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const [weather, setWeather] = useState(null);
  const [hourly, setHourly] = useState([]);
  const [score, setScore] = useState(null);
  const [scoreLabel, setScoreLabel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [current, forecast] = await Promise.all([
        getCurrentWeather(lat, lng),
        getHourlyForecast(lat, lng).catch(() => []), // graceful fallback
      ]);

      const uvIndex = current?.uvi ?? 5;
      const calculatedScore = getSunstayScore(current, uvIndex);
      const label = getScoreLabel(calculatedScore);

      setWeather(current);
      setHourly(forecast);
      setScore(calculatedScore);
      setScoreLabel(label);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [lat, lng]);

  useEffect(() => {
    fetchWeather();
    // Refresh every 10 minutes
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  return { weather, hourly, score, scoreLabel, loading, error, lastUpdated, refresh: fetchWeather };
}
