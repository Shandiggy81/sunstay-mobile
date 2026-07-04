import React, { useState, useEffect } from 'react';
import { getSunData } from '../utils/getSunData';

function getWeatherEmoji(code, isNight) {
  if (code === 0)                               return isNight ? '🌙' : '☀️';
  if (code === 1)                               return isNight ? '🌙' : '🌤️';
  if (code === 2)                               return isNight ? '☁️' : '⛅';
  if (code === 3)                               return '☁️';
  if (code === 45 || code === 48)               return '🌫️';
  if (code >= 51 && code <= 57)                 return isNight ? '🌧️' : '🌦️';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if (code >= 71 && code <= 77)                 return '❄️';
  if (code >= 95)                               return '⛈️';
  return isNight ? '🌙' : '🌤️';
}

const ShimmerCard = () => (
  <div
    style={{
      flexShrink: 0,
      width: 54,
      height: 82,
      borderRadius: 14,
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.10)',
      animation: 'ss-pulse 1.4s ease-in-out infinite',
    }}
  />
);

if (typeof document !== 'undefined' && !document.getElementById('ss-pulse-kf')) {
  const style = document.createElement('style');
  style.id = 'ss-pulse-kf';
  style.textContent = '@keyframes ss-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }';
  document.head.appendChild(style);
}

export default function HourlyForecastStrip({ lat, lng }) {
  const [hourly, setHourly]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [sunshineMinsToday, setSunshineMinsToday] = useState(null);

  const latNum = lat != null ? Number(lat) : NaN;
  const lngNum = lng != null ? Number(lng) : NaN;
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);

  useEffect(() => {
    if (!hasCoords) {
      setLoading(false);
      setHourly([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      latitude:      String(latNum),
      longitude:     String(lngNum),
      hourly:        'temperature_2m,apparent_temperature,weather_code,weathercode,precipitation_probability,cloud_cover,cloudcover,wind_gusts_10m,windgusts_10m,precipitation,visibility,sunshine_duration,shortwave_radiation,direct_normal_irradiance',
      timezone:      'auto',
      forecast_days: '1',
    });

    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (!data?.hourly?.time) { setHourly([]); return; }

        const now  = new Date();
        const rows = data.hourly.time
          .map((t, i) => ({
            time:        new Date(t),
            temp:        Math.round(data.hourly.temperature_2m[i]),
            feelsLike:   Math.round(data.hourly.apparent_temperature?.[i] ?? data.hourly.temperature_2m[i]),
            code:        data.hourly.weather_code?.[i] ?? data.hourly.weathercode?.[i] ?? 0,
            precip:      data.hourly.precipitation_probability?.[i] ?? 0,
            clouds:      data.hourly.cloud_cover?.[i] ?? data.hourly.cloudcover?.[i] ?? 0,
            gusts:       Math.round(((data.hourly.wind_gusts_10m?.[i] ?? data.hourly.windgusts_10m?.[i] ?? 0)) * 3.6),
            rainMm:      (data.hourly.precipitation?.[i] ?? 0).toFixed(1),
            visibility:  Math.round((data.hourly.visibility?.[i] ?? 10000) / 1000),
            sunshineMins: Math.round((data.hourly.sunshine_duration?.[i] ?? 0) / 60),
            solarW:      Math.round(data.hourly.shortwave_radiation?.[i] ?? 0),
          }))
          .filter(r => r.time >= now)
          .slice(0, 12);

        setHourly(rows);

        let directSunHours = 0;
        for (let i = 0; i < 24; i++) {
          const dni   = data.hourly.direct_normal_irradiance?.[i] ?? 0;
          const cloud = data.hourly.cloud_cover?.[i] ?? data.hourly.cloudcover?.[i] ?? 0;
          if (dni > 200 && cloud < 60) directSunHours += 1;
        }
        setSunshineMinsToday(directSunHours * 60);
      })
      .catch(() => { if (!cancelled) setHourly([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latNum, lngNum]);

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        background: '#12141c',
        borderRadius: 16,
        padding: '12px 0 4px',
        margin: '12px 0 0',
      }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 4 }}>
          {Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── No data fallback ──────────────────────────────────────────
  if (!hourly.length) {
    return (
      <div style={{
        background: '#12141c',
        borderRadius: 16,
        padding: '12px 16px',
        margin: '12px 0 0',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Forecast unavailable</span>
      </div>
    );
  }

  // ── Render strip ──────────────────────────────────────────────
  return (
    <div style={{
      background: '#12141c',
      borderRadius: 16,
      padding: '12px 0 8px',
      margin: '12px 0 0',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          12-Hour Forecast
        </span>
        {sunshineMinsToday !== null && (
          <span style={{ color: '#FCD34D', fontSize: 11, fontWeight: 800 }}>
            ☀️ {sunshineMinsToday >= 60
              ? `${(sunshineMinsToday / 60).toFixed(1)} hrs direct sun today`
              : `${sunshineMinsToday} mins direct sun today`}
          </span>
        )}
      </div>

      {/* Scrollable hour cards */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, paddingLeft: 12, paddingRight: 12, scrollbarWidth: 'none' }}>
        {hourly.map((hour, i) => {
          const sunData    = getSunData(latNum, lngNum);
          const startHour  = sunData?.startHour ?? 6;
          const endHour    = sunData?.endHour   ?? 18;
          const currentH   = hour.time.getHours() + hour.time.getMinutes() / 60;
          const isNight    = currentH < startHour || currentH > endHour;
          const isGolden   = hour.solarW > 400 && hour.precip < 20;
          const isWarm     = hour.feelsLike >= 18 && hour.feelsLike < 28 && !isGolden;
          const isWet      = hour.precip >= 60;

          return (
            <div
              key={i}
              style={{
                flexShrink: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 10px',
                borderRadius: 14,
                minWidth: 54,
                background: isWet    ? 'rgba(56,189,248,0.12)'
                          : isGolden ? 'rgba(245,158,11,0.16)'
                          : isWarm   ? 'rgba(16,185,129,0.10)'
                          : 'rgba(255,255,255,0.06)',
                border: isWet    ? '1px solid rgba(56,189,248,0.25)'
                      : isGolden ? '1px solid rgba(245,158,11,0.32)'
                      : isWarm   ? '1px solid rgba(16,185,129,0.22)'
                      : '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: 700, margin: 0 }}>
                {hour.time.toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(' ', '').toLowerCase()}
              </p>
              <span style={{ fontSize: 18 }}>{getWeatherEmoji(hour.code, isNight)}</span>
              <p style={{ fontSize: 13, color: '#fff', fontWeight: 800, margin: 0 }}>{hour.temp}°</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.50)', fontWeight: 700, margin: 0 }}>
                {hour.precip > 0 ? `${hour.precip}%🌧️` : hour.solarW > 0 ? `${hour.solarW}W` : ''}
              </p>
              {hour.gusts > 25 && (
                <p style={{ fontSize: 9, color: 'rgba(125,211,252,0.85)', fontWeight: 700, margin: 0 }}>💨{hour.gusts}</p>
              )}
              {hour.feelsLike !== hour.temp && (
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600, margin: 0 }}>f{hour.feelsLike}°</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
