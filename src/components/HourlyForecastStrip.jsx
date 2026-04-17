import React from 'react';
import { useWeather } from '../hooks/useWeather';

function getWeatherEmoji(iconCode) {
  if (!iconCode) return '🌤️';
  if (iconCode.startsWith('01')) return '☀️';
  if (iconCode.startsWith('02')) return '🌤️';
  if (iconCode.startsWith('03') || iconCode.startsWith('04')) return '☁️';
  if (iconCode.startsWith('09') || iconCode.startsWith('10')) return '🌧️';
  if (iconCode.startsWith('11')) return '⛈️';
  if (iconCode.startsWith('13')) return '❄️';
  return '🌫️';
}

/**
 * HourlyForecastStrip — horizontal scrollable 12-hour forecast
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export default function HourlyForecastStrip({ lat, lng }) {
  const { hourly, loading } = useWeather(lat, lng);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-14 h-20 bg-amber-500/10 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!hourly?.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-3 pt-1">
        {hourly.slice(0, 12).map((hour, i) => {
          const time = new Date(hour.dt * 1000);
          const temp = Math.round(hour.temp);
          const clouds = hour.clouds ?? 0;
          const emoji = getWeatherEmoji(hour.weather?.[0]?.icon);
          const isGolden = clouds < 20;

          return (
            <div
              key={i}
              className="flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2.5 rounded-2xl transition-all"
              style={{
                background: isGolden ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)',
                border: isGolden ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.08)',
                minWidth: '52px'
              }}
            >
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
                {time.toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(' ', '').toLowerCase()}
              </p>
              <span className="text-base">{emoji}</span>
              <p style={{ fontSize: '13px', color: '#fff', fontWeight: 800 }}>{temp}°</p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>{clouds}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
