import React from 'react';
import { useWeather } from '../hooks/useWeather';

/**
 * WeatherWidget — displays live weather + Sunstay Score for a venue location
 * @param {number} lat - Venue latitude
 * @param {number} lng - Venue longitude
 * @param {string} venueName - Optional venue name for context
 */
export default function WeatherWidget({ lat, lng, venueName }) {
  const { weather, score, scoreLabel, loading, error, lastUpdated, refresh } = useWeather(lat, lng);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-950/40 rounded-2xl animate-pulse">
        <div className="w-8 h-8 bg-amber-500/30 rounded-full" />
        <div className="flex flex-col gap-1">
          <div className="w-24 h-3 bg-amber-500/30 rounded" />
          <div className="w-16 h-2 bg-amber-500/20 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-red-950/40 rounded-2xl text-red-400 text-xs">
        Weather unavailable
      </div>
    );
  }

  const temp = Math.round(weather?.main?.temp ?? 0);
  const feelsLike = Math.round(weather?.main?.feels_like ?? 0);
  const clouds = weather?.clouds?.all ?? 0;
  const windSpeed = (weather?.wind?.speed ?? 0).toFixed(1);
  const humidity = weather?.main?.humidity ?? 0;
  const description = weather?.weather?.[0]?.description ?? '';

  return (
    <div className="bg-gradient-to-br from-amber-950/60 to-orange-950/40 border border-amber-500/20 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-amber-400 text-xs font-medium uppercase tracking-wider">
            {venueName ? `${venueName} Weather` : 'Live Weather'}
          </p>
          <p className="text-white/60 text-xs capitalize">{description}</p>
        </div>
        <button onClick={refresh} className="text-amber-500/60 hover:text-amber-400 text-xs transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Sunstay Score */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-2xl">{scoreLabel?.emoji}</span>
          <span className="text-amber-400 font-bold text-sm">{score}</span>
        </div>
        <div>
          <p className="text-white font-semibold text-lg">{scoreLabel?.label}</p>
          <p className="text-white/50 text-xs">Sunstay Score</p>
        </div>
      </div>

      {/* Weather Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Stat icon="🌡️" label="Temp" value={`${temp}°C`} sub={`Feels ${feelsLike}°C`} />
        <Stat icon="☁️" label="Cloud Cover" value={`${clouds}%`} />
        <Stat icon="💨" label="Wind" value={`${windSpeed} m/s`} />
        <Stat icon="💧" label="Humidity" value={`${humidity}%`} />
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-white/30 text-xs text-right">
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub }) {
  return (
    <div className="bg-white/5 rounded-xl px-3 py-2">
      <p className="text-white/40 text-xs">{icon} {label}</p>
      <p className="text-white font-medium text-sm">{value}</p>
      {sub && <p className="text-white/40 text-xs">{sub}</p>}
    </div>
  );
}
