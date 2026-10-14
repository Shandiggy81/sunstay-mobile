import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  calculateBalconySunDay, calculateMonthlySunSummary, DEFAULT_TIME_ZONE,
  formatGuestDate, formatGuestWindows, venueLocalDate,
} from '../utils/balconySunEngine.js';

export default function RoomSunCard({ room, venue }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);

  const timeZone = venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE;
  const orientation = room?.orientation;
  const lat = venue?.lat == null || venue.lat === '' ? null : Number(venue.lat);
  const lng = venue?.lng == null || venue.lng === '' ? null : Number(venue.lng);
  const missingGeometry = orientation == null || String(orientation).trim() === '' || lat === null || lng === null;
  let today = null;
  try { today = venueLocalDate(now, timeZone); } catch { /* Show an error, not an unrelated demo score. */ }
  const obstructions = room?.obstructions;
  const overhang = room?.overhang;
  const options = useMemo(() => ({ lat, lng, facing: orientation, timeZone, obstructions, overhang }),
    [lat, lng, orientation, timeZone, obstructions, overhang]);
  const sun = useMemo(() => {
    if (missingGeometry) return null;
    try {
      if (!today) throw new Error('Invalid venue timezone');
      // TODO: obstructionLevel ("Partial", "Open", etc.) needs a surveyed angular
      // horizon. Do not translate those labels into invented shading geometry.
      return { daily: calculateBalconySunDay({ ...options, date: today }) };
    } catch { return { error: true }; }
  }, [options, today, missingGeometry]);
  const [seasonal, setSeasonal] = useState(null);
  const year = today ? Number(today.slice(0, 4)) : null;
  const hasDaily = Boolean(sun?.daily);
  useEffect(() => {
    if (!hasDaily) return;
    let cancelled = false;
    const calculate = () => {
      if (cancelled) return;
      try { setSeasonal({ options, year, months: calculateMonthlySunSummary({ ...options, year }) }); }
      catch { setSeasonal({ options, year, months: null }); }
    };
    // Cross a paint boundary before doing the 12 representative-day calculations.
    let idle, timer;
    const frame = requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(calculate, { timeout: 1000 });
      else timer = setTimeout(calculate, 0);
    });
    return () => {
      cancelled = true; cancelAnimationFrame(frame);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [options, year, hasDaily]);
  if (!room) return null;

  const {
    name,
    floorLevel,
    sunScore,
    sunProfile,
    baseNightlyRateDemo
  } = room;

  const pct = missingGeometry ? Math.max(0, Math.min(100, sunScore || 0)) : 0;
  const daily = sun?.daily;
  const months = seasonal?.options === options && seasonal.year === year ? seasonal.months : undefined;
  const bestMonths = months?.filter(month => month.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.month - b.month).slice(0, 3)
    .sort((a, b) => a.month - b.month).map(month =>
      new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone }).format(new Date(`${month.date}T12:00:00Z`))).join(', ');
  const verdict = value => value.available === null ? 'Unavailable · no sunset today'
    : value.available ? `Yes · ${formatGuestWindows(value.windows, timeZone)}` : 'No';

  const { bg, border, text, fill } = pct >= 75
    ? { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.28)', text: '#065F46', fill: '#10B981' }
    : pct >= 50
    ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', text: '#92400E', fill: '#F59E0B' }
    : { bg: 'rgba(14,165,233,0.07)', border: 'rgba(14,165,233,0.22)', text: '#0C4A6E', fill: '#0EA5E9' };

  return (
    <motion.div
      className="rounded-2xl p-4 flex flex-col gap-3 mb-3"
      style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-black text-slate-800 text-[15px]">{name}</h4>
          <p className="text-slate-500 text-[12px] font-semibold mt-0.5">
            Level {floorLevel} &bull; {orientation} facing
          </p>
        </div>
        <div className="text-right">
          <span className="font-black text-slate-800">${baseNightlyRateDemo}</span>
          <span className="text-slate-500 text-[10px] block">/ night</span>
        </div>
      </div>

      {daily ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-slate-700">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-900">Today’s balcony sun · {formatGuestDate(daily.dayStart, timeZone)}</p>
          <p className="mt-1 text-[14px] font-bold">{Math.floor(daily.totalMinutes / 60)}h {daily.totalMinutes % 60}m total direct sun</p>
          <p className="mt-1 text-[13px] font-semibold break-words">
            {daily.windows.length ? formatGuestWindows(daily.windows, timeZone) : 'No direct sun on this balcony today'}
          </p>
          <p className="mt-2 text-[12px]"><span className="font-bold">☕ Morning coffee:</span> {verdict(daily.morningCoffee)}</p>
          <p className="mt-1 text-[12px]"><span className="font-bold">🥂 Sunset drinks:</span> {verdict(daily.sunsetDrinks)}</p>
          <p className="mt-2 text-[11px] text-slate-600">Best months: {months === undefined ? 'Calculating…' : months === null ? 'Unavailable' : bestMonths || 'No modelled direct sun'} · 15th-of-month estimates</p>
          <p className="mt-1 text-[11px] text-slate-600">Estimated from the sun&apos;s path, not a weather forecast.</p>
        </div>
      ) : missingGeometry ? (
      <div className="flex items-center gap-3 mt-1" style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '8px 12px' }}>
        <div className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="3" />
            <motion.circle
              cx="18" cy="18" r="15" fill="none"
              stroke={fill} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 15}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 15 * (1 - pct / 100) }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-black leading-none" style={{ color: text }}>{pct}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: text }}>Illustrative sun profile</span>
          <p className="text-[13px] font-semibold mt-0.5 text-slate-700 leading-tight">
            {sunProfile?.peakTime && `Peak sun: ${sunProfile.peakTime}`}
          </p>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            {sunProfile?.useCase && `Ideal for ${sunProfile.useCase.toLowerCase()}`}
          </p>
          <p className="text-[11px] text-slate-600 mt-1">Live estimate needs room orientation and venue coordinates.</p>
        </div>
      </div>
      ) : (
        <p className="rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-[12px] text-slate-700" role="status">
          Balcony sun unavailable. Check the room bearing, coordinates, timezone and measured shading geometry.
        </p>
      )}
    </motion.div>
  );
}
