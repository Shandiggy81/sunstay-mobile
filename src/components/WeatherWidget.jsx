import React from 'react';
import { useWeather } from '../hooks/useWeather';
import { useOpenMeteo } from '../hooks/useOpenMeteo';

/**
 * WeatherWidget – displays live weather + Sunstay Score for a venue location
 * @param {number} lat - Venue latitude
 * @param {number} lng - Venue longitude
 * @param {string} venueName - Optional venue name for context
 */
export default function WeatherWidget({ lat, lng, venueName }) {
  const { weather, score, scoreLabel, loading, error, lastUpdated, refresh } = useWeather(lat, lng);
  const { data: solarData } = useOpenMeteo(lat, lng);

  const displayScore = solarData?.sunstayScore ?? score;
  const displayLabel = solarData?.scoreLabel ?? scoreLabel;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm animate-pulse">
        <div className="w-8 h-8 bg-slate-200 rounded-full" />
        <div className="flex flex-col gap-1">
          <div className="w-24 h-3 bg-slate-200 rounded" />
          <div className="w-16 h-2 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  if (error) return (
    <div className="px-4 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-500 text-sm">
      ☀️ 20°C
    </div>
  );

  const temp = Math.round(weather?.main?.temp ?? 0);
  const feelsLike = Math.round(weather?.main?.feels_like ?? 0);
  const clouds = weather?.clouds?.all ?? 0;
  const windSpeed = (weather?.wind?.speed ?? 0).toFixed(1);
  const humidity = weather?.main?.humidity ?? 0;
  const description = weather?.weather?.[0]?.description ?? '';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-800 text-xs font-medium uppercase tracking-wider">
            {venueName ? `${venueName} Weather` : 'Live Weather'}
          </p>
          <p className="text-slate-500 text-xs capitalize">{description}</p>
        </div>
        <button onClick={refresh} className="text-slate-500 hover:text-slate-800 text-xs transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Sunstay Score */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <span className="text-2xl">{displayLabel?.emoji}</span>
          <span className="text-slate-800 font-bold text-sm">{displayScore}</span>
        </div>
        <div>
          <p className="text-slate-800 font-semibold text-lg">{displayLabel?.label}</p>
          <p className="text-slate-500 text-xs">Sunstay Score</p>
        </div>
      </div>

      {/* Weather Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <Stat icon="🌡️" label="Temp" value={`${temp}°C`} sub={`Feels ${feelsLike}°C`} />
        <Stat icon="☁️" label="Cloud Cover" value={`${clouds}%`} />
        <Stat icon="💨" label="Wind" value={`${windSpeed} m/s`} />
        <Stat icon="💧" label="Humidity" value={`${humidity}%`} />
      </div>

      {/* Solar Intelligence Data */}
      {solarData && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          <Stat icon="🛰️" label="Solar Radiation" value={`${solarData.current.solarRadiation} W/m²`} />
          <Stat icon="🔆" label="UV Index" value={solarData.current.uvIndex.toFixed(1)} sub={`Clear sky: ${solarData.current.uvIndexClearSky.toFixed(1)}`} />
          <Stat icon="☀️" label="Direct Sun" value={`${solarData.current.directRadiation} W/m²`} />
          <Stat icon="⏱️" label="Sun Duration" value={`${Math.round(solarData.current.sunshineDuration / 60)} min`} />
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-slate-500 text-xs text-right">
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2">
      <p className="text-slate-500 text-xs">{icon} {label}</p>
      <p className="text-slate-800 font-medium text-sm">{value}</p>
      {sub && <p className="text-slate-500 text-xs">{sub}</p>}
    </div>
  );
}
