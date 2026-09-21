import React, { useState, useEffect } from 'react';
import { getSunData } from '../utils/getSunData';
import { shouldFetchRemote } from '../hooks/shouldFetchRemote';
import { normalizeHourlyForecast, countDirectSunHours } from '../utils/normalizeHourlyForecast';
import {
  resolveForecastView,
  forecastItemCount,
  forecastDataPresent,
} from '../utils/resolveForecastView';
import ForecastFallbackCard from './common/ForecastFallbackCard';

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

export default function HourlyForecastStrip({ lat, lng, enabled = true, onViewState }) {
  const [hourly, setHourly]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(false);
  const [sunshineMinsToday, setSunshineMinsToday] = useState(null);

  const latNum = lat != null ? Number(lat) : NaN;
  const lngNum = lng != null ? Number(lng) : NaN;
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const view = resolveForecastView({ loading, error, items: hourly });
  const itemCount = forecastItemCount(hourly);
  const dataPresent = forecastDataPresent(hourly);

  useEffect(() => {
    onViewState?.({
      loading,
      error,
      view,
      itemCount,
      dataPresent,
      branch: 'hourly-forecast-strip',
    });
  }, [loading, error, view, itemCount, dataPresent, onViewState]);

  useEffect(() => {
    if (!shouldFetchRemote({ enabled, lat, lng }) || !hasCoords) {
      setLoading(false);
      setError(false);
      if (!enabled) return;
      setHourly([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({
      latitude:      String(latNum),
      longitude:     String(lngNum),
      hourly:        'temperature_2m,apparent_temperature,weather_code,weathercode,precipitation_probability,cloud_cover,cloudcover,wind_gusts_10m,windgusts_10m,precipitation,visibility,sunshine_duration,shortwave_radiation,direct_normal_irradiance',
      timezone:      'auto',
      forecast_days: '1',
      wind_speed_unit: 'kmh',
    });

    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;

        setHourly(normalizeHourlyForecast(data, { now: new Date(), limit: 12 }));
        setError(false);

        const directSunHours = countDirectSunHours(data, 24);
        setSunshineMinsToday(directSunHours === null ? null : directSunHours * 60);
      })
      .catch(() => {
        if (cancelled) return;
        setHourly([]);
        setSunshineMinsToday(null);
        setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, latNum, lngNum]);

  const stateAttrs = {
    'data-forecast-state': view,
    'data-forecast-count': String(itemCount),
    'data-forecast-data': dataPresent ? 'yes' : 'no',
    'data-render-branch': 'hourly-forecast-strip',
  };

  // ── Loading state ─────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div
        {...stateAttrs}
        role="status"
        aria-label="Loading sun forecast"
        style={{
          background: '#1a1d27',
          borderRadius: 12,
          padding: '10px 0 4px',
          margin: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 4 }}>
          {Array.from({ length: 6 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      </div>
    );
  }

  // ── Fetch failure ─────────────────────────────────────────────
  if (view === 'error') {
    return (
      <ForecastFallbackCard
        {...stateAttrs}
        variant="error"
        title="Couldn’t load the sun forecast"
      >
        Check your connection and open this tab again.
      </ForecastFallbackCard>
    );
  }

  // ── Empty timeline ────────────────────────────────────────────
  if (view === 'empty') {
    return (
      <ForecastFallbackCard
        {...stateAttrs}
        variant="empty"
        title="No hourly sun data yet"
      >
        The timeline for this venue is empty. Overview still works.
      </ForecastFallbackCard>
    );
  }

  // ── Render strip ──────────────────────────────────────────────
  // The daylight window is the same for every row, so resolve it once rather
  // than recomputing sun position per hour card.
  const sunData   = getSunData(latNum, lngNum);
  const startHour = sunData?.startHour ?? 6;
  const endHour   = sunData?.endHour   ?? 18;

  return (
    <div
      {...stateAttrs}
      style={{
      background: '#1a1d27',
      borderRadius: 12,
      padding: '10px 0 6px',
      margin: 0,
      border: '1px solid rgba(255,255,255,0.06)',
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
