import { useState, useEffect } from 'react';

export function useOpenMeteo(lat, lng) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const controller = new AbortController();

    async function fetchSolarData() {
      try {
        setLoading(true);
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lng);
        url.searchParams.set('current', [
          'temperature_2m',
          'apparent_temperature',
          'uv_index',
          'uv_index_clear_sky',
          'shortwave_radiation',
          'direct_radiation',
          'diffuse_radiation',
          'sunshine_duration',
          'cloud_cover',
          'wind_speed_10m',
          'wind_gusts_10m',
          'precipitation',
          'weather_code',
          'is_day'
        ].join(','));
        url.searchParams.set('daily', [
          'uv_index_max',
          'uv_index_clear_sky_max',
          'sunshine_duration',
          'shortwave_radiation_sum',
          'precipitation_sum',
          'wind_gusts_10m_max'
        ].join(','));
        url.searchParams.set('timezone', 'Australia/Melbourne');
        url.searchParams.set('forecast_days', '7');

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
        const json = await res.json();

        const current = json.current;

        // Calculate Sunstay Score (0-100)
        const uvScore = Math.min((current.uv_index / 10) * 30, 30);
        const radiationScore = Math.min((current.direct_radiation / 800) * 40, 40);
        const cloudScore = Math.max(0, (1 - current.cloud_cover / 100) * 20);
        const isDayBonus = current.is_day === 1 ? 10 : 0;
        const sunstayScore = Math.round(uvScore + radiationScore + cloudScore + isDayBonus);

        const getScoreLabel = (score) => {
          if (score >= 85) return { label: 'Perfect', emoji: '\uD83C\uDF1E', color: 'text-orange-500' };
          if (score >= 70) return { label: 'Great', emoji: '\u2600\uFE0F', color: 'text-yellow-500' };
          if (score >= 50) return { label: 'Good', emoji: '\uD83C\uDF24\uFE0F', color: 'text-blue-400' };
          if (score >= 30) return { label: 'Okay', emoji: '\u26C5', color: 'text-slate-400' };
          return { label: 'Poor', emoji: '\u2601\uFE0F', color: 'text-slate-300' };
        };

        setData({
          current: {
            temp: Math.round(current.temperature_2m),
            feelsLike: Math.round(current.apparent_temperature),
            uvIndex: current.uv_index,
            uvIndexClearSky: current.uv_index_clear_sky,
            solarRadiation: Math.round(current.shortwave_radiation),
            directRadiation: Math.round(current.direct_radiation),
            diffuseRadiation: Math.round(current.diffuse_radiation),
            sunshineDuration: current.sunshine_duration,
            cloudCover: current.cloud_cover,
            windSpeed: current.wind_speed_10m,
            windGusts: current.wind_gusts_10m,
            precipitation: current.precipitation,
            weatherCode: current.weather_code,
            isDay: current.is_day === 1,
          },
          daily: json.daily,
          sunstayScore,
          scoreLabel: getScoreLabel(sunstayScore),
          lastUpdated: new Date(),
        });
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSolarData();
    const interval = setInterval(fetchSolarData, 15 * 60 * 1000); // refresh every 15 mins
    return () => { controller.abort(); clearInterval(interval); };
  }, [lat, lng]);

  return { data, loading, error };
}
