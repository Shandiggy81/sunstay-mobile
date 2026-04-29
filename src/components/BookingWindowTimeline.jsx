import React from 'react';
import { motion } from 'framer-motion';
const ICONS = {
  sunny:   '☀️',
  cloudy:  '⛅',
  rainy:   '🌧️',
  windy:   '💨',
  night:   '🌙',
};
function getConditionIcon(rainProb, cloudCover, hour) {
  if (hour < 6 || hour >= 21) return ICONS.night;
  if (rainProb >= 55) return ICONS.rainy;
  if (cloudCover >= 70) return ICONS.cloudy;
  return ICONS.sunny;
}
function getBarColor(score) {
  if (score >= 70) return 'from-amber-400 to-yellow-300';
  if (score >= 45) return 'from-emerald-500 to-emerald-300';
  if (score >= 25) return 'from-slate-500 to-slate-300';
  return 'from-blue-600 to-indigo-400';
}
export default function BookingWindowTimeline({ venue, weatherHours, bookingStart, bookingEnd }) {
  if (!weatherHours || weatherHours.length === 0) return null;
  // Default to next 6 hours from now if no booking window set
  const now = new Date();
  const startH = bookingStart ?? now.getHours();
  const endH   = bookingEnd   ?? Math.min(startH + 6, 23);
  const hours = weatherHours.filter(h => {
    const hr = new Date(h.time).getHours();
    return hr >= startH && hr <= endH;
  }).slice(0, 8);
  if (hours.length === 0) return null;
  const windowLabel = bookingStart
    ? `${String(bookingStart).padStart(2,'0')}:00 – ${String(bookingEnd).padStart(2,'0')}:00`
    : 'Next 6 hrs';
  const avgRainProb = Math.round(hours.reduce((s,h) => s + (h.precipProbability ?? 0), 0) / hours.length);
  const peakSun     = Math.max(...hours.map(h => h.sunshineScore ?? h.uvIndex * 10 ?? 0));
  const rainRisk    = avgRainProb >= 55 ? 'High' : avgRainProb >= 30 ? 'Medium' : 'Low';
  const rainColor   = rainRisk === 'High' ? '#F87171' : rainRisk === 'Medium' ? '#FCD34D' : '#34D399';
  return (
    <div className="mt-3 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-black text-white/50">
            ⏱ Booking Window Forecast
          </p>
          <p className="text-[13px] font-bold text-white mt-0.5">{windowLabel} · {venue?.suburb ?? 'Live'}</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: `${rainColor}18`, border: `1px solid ${rainColor}44` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: rainColor }} />
          <span className="text-[10px] font-bold" style={{ color: rainColor }}>{rainRisk} Rain Risk</span>
        </div>
      </div>
      {/* Hourly bars */}
      <div className="px-3 pb-1">
        <div className="flex items-end justify-between gap-1" style={{ height: 72 }}>
          {hours.map((h, i) => {
            const hr    = new Date(h.time).getHours();
            const score = h.sunshineScore ?? Math.max(0, 100 - (h.precipProbability ?? 0) - (h.cloudCover ?? 0) * 0.3);
            const isNow = hr === now.getHours();
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[10px]">{getConditionIcon(h.precipProbability ?? 0, h.cloudCover ?? 0, hr)}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(score, 6)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className={`w-full rounded-t-md bg-gradient-to-t ${getBarColor(score)} ${isNow ? 'shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'opacity-80'}`}
                />
              </div>
            );
          })}
        </div>
      </div>
      {/* Time labels */}
      <div className="flex justify-between px-3 pb-2">
        {hours.map((h, i) => {
          const hr  = new Date(h.time).getHours();
          const isNow = hr === now.getHours();
          return (
            <span key={i} className={`flex-1 text-center text-[9px] tabular-nums ${isNow ? 'text-amber-300 font-bold' : 'text-white/40'}`}>
              {hr === 0 ? '12a' : hr < 12 ? `${hr}a` : hr === 12 ? '12p' : `${hr-12}p`}
            </span>
          );
        })}
      </div>
      {/* Summary strip */}
      <div className="flex divide-x divide-white/8 border-t border-white/8">
        <div className="flex-1 py-2 text-center">
          <p className="text-[9px] text-white/40 uppercase tracking-wider">Rain Chance</p>
          <p className="text-[13px] font-black" style={{ color: rainColor }}>{avgRainProb}%</p>
        </div>
        <div className="flex-1 py-2 text-center">
          <p className="text-[9px] text-white/40 uppercase tracking-wider">Peak Sun</p>
          <p className="text-[13px] font-black text-amber-300">{Math.min(peakSun, 100)}</p>
        </div>
        <div className="flex-1 py-2 text-center">
          <p className="text-[9px] text-white/40 uppercase tracking-wider">UV Index</p>
          <p className="text-[13px] font-black text-orange-300">{hours?.uvIndex ?? '—'}</p>
        </div>
        <div className="flex-1 py-2 text-center">
          <p className="text-[9px] text-white/40 uppercase tracking-wider">Wind</p>
          <p className="text-[13px] font-black text-sky-300">{hours?.windspeed ?? '—'}<span className="text-[9px] font-normal"> km/h</span></p>
        </div>
      </div>
    </div>
  );
}
