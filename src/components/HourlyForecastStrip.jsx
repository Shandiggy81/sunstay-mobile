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

  if (!hourly.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-amber-400 text-xs font-medium uppercase tracking-wider">Next 12 Hours</p>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {hourly.map((hour, i) => {
          const time = new Date(hour.dt * 1000);
          const temp = Math.round(hour.temp);
          const clouds = hour.clouds ?? 0;
          const emoji = getWeatherEmoji(hour.weather?.[0]?.icon);
          const isGolden = clouds < 20;

          return (
            <div
              key={i}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-3 rounded-xl border transition-all ${
                isGolden
                  ? 'bg-amber-500/15 border-amber-500/40'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <p className="text-white/50 text-xs">
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <span className="text-xl">{emoji}</span>
              <p className="text-white font-medium text-sm">{temp}°</p>
              <p className="text-white/40 text-xs">{clouds}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
