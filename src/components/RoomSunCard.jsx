import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Coffee, Sun, Wine } from 'lucide-react';
import SunDayTimeline from './SunDayTimeline.jsx';
import {
  calculateBalconySunDay, calculateMonthlySunSummary, DEFAULT_TIME_ZONE,
  formatGuestDate, venueLocalDate,
} from '../utils/balconySunEngine.js';
import { formatCompactGuestWindows } from '../utils/comfortDisplay.js';

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
  const exposureLabel = room.source && !room.hasBalcony && !room.hasOutdoorArea ? 'facade sun' : 'balcony sun';
  const months = seasonal?.options === options && seasonal.year === year ? seasonal.months : undefined;
  const bestMonths = months?.filter(month => month.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.month - b.month).slice(0, 3)
    .sort((a, b) => a.month - b.month).map(month =>
      new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone }).format(new Date(`${month.date}T12:00:00Z`)));

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
            Level {floorLevel} &bull; {typeof orientation === 'number' ? `${Math.round(orientation)}°` : orientation} facing
          </p>
        </div>
        {baseNightlyRateDemo != null && baseNightlyRateDemo !== '' && <div className="text-right shrink-0">
          <span className="font-black text-slate-800">${baseNightlyRateDemo}</span>
          <span className="text-slate-500 text-[10px] block">/ night</span>
        </div>}
      </div>
      {room.source === 'estimated' ? <p className="text-[11px] text-slate-500">Estimated from building shape</p>
        : room.source === 'venue-verified' ? <p className="text-[11px] font-semibold text-emerald-700">Verified by venue</p> : null}

      {daily ? (
        <div className="border-t border-slate-100 pt-3 text-slate-700">
          <p className="text-[28px] font-extrabold leading-tight text-slate-800">{Math.floor(daily.totalMinutes / 60)}h {daily.totalMinutes % 60}m</p>
          <p className="mt-1 text-[12px] text-slate-500">{exposureLabel} · {formatGuestDate(daily.dayStart, timeZone)}</p>
          <SunDayTimeline daily={daily} timeZone={timeZone} now={now} label={exposureLabel} />
          <div className="space-y-2 text-[14px]">
            {(daily.windows.length ? daily.windows : [null]).map((window, index) => <p key={index} className="flex items-start gap-2 font-medium"><Sun size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" /><span>{window ? `Sun ${formatCompactGuestWindows([window], timeZone)}` : `No direct ${exposureLabel} today`}</span></p>)}
            <p className={`flex items-start gap-2 ${daily.morningCoffee.available ? 'text-emerald-700' : 'text-slate-500'}`}><Coffee size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{daily.morningCoffee.available ? `✓ Morning coffee · ${formatCompactGuestWindows(daily.morningCoffee.windows, timeZone)}` : 'No morning sun'}</span></p>
            <p className={`flex items-start gap-2 ${daily.sunsetDrinks.available ? 'text-emerald-700' : 'text-slate-500'}`}><Wine size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{daily.sunsetDrinks.available ? `✓ Sunset drinks · ${formatCompactGuestWindows(daily.sunsetDrinks.windows, timeZone)}` : daily.sunsetDrinks.available === null ? 'No sunset today' : 'No sunset sun'}</span></p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Best months, representative 15th-of-month estimates">
            <span className="mr-1 text-slate-500">Best months</span>
            {months === undefined ? <span role="status" className="h-5 w-12 rounded-full bg-amber-100 motion-safe:animate-pulse"><span className="sr-only">Calculating best months</span></span>
              : bestMonths?.length ? bestMonths.map(month => <span key={month} className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">{month}</span>)
              : <span className="text-slate-500">{months === null ? 'Unavailable' : 'No modelled direct sun'}</span>}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Estimated from the sun&apos;s path, not a weather forecast.</p>
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
