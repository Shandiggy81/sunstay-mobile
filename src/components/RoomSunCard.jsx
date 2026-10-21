import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import SunMomentsPanel from './SunMomentsPanel.jsx';
import ClayIcon from './common/ClayIcon';
import { sunMomentsFromDay } from '../utils/sunMoments.js';
import {
  calculateBalconySunDay, calculateMonthlySunSummary, DEFAULT_TIME_ZONE,
  formatGuestDate, venueLocalDate,
} from '../utils/balconySunEngine.js';
import { formatCompactGuestWindows } from '../utils/comfortDisplay.js';
import { roomSourceLabel } from '../utils/roomProfiles.js';
import { stayRoomDisplay } from '../utils/stayRoomTypes.js';

// "North-facing rooms · Level 8" → "North-facing rooms" (the level is shown underneath).
const roomTitle = (name) => String(name ?? '').replace(/\s*·\s*Level\s+\d+\s*$/i, '');
const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const directionWord = (deg) => DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export default function RoomSunCard({ room, venue, date, highlighted = false, forecast = null }) {
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
  try { today = date || venueLocalDate(now, timeZone); } catch { /* Show an error, not an unrelated demo score. */ }
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
  // Facade sides are named as sides of the building, never as bookable rooms.
  const display = useMemo(() => room ? stayRoomDisplay(venue, room, { now }) : null, [venue, room, now]);
  if (!room) return null;
  const facadeSide = display?.kind === 'facade_side';

  const {
    name,
    floorLevel,
    sunScore,
    sunProfile,
    baseNightlyRateDemo
  } = room;

  const pct = missingGeometry ? Math.max(0, Math.min(100, sunScore || 0)) : 0;
  const daily = sun?.daily;
  const exposureLabel = room.source && !room.hasBalcony && !room.hasOutdoorArea ? 'sun on this side' : 'sun on the balcony';
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
      data-matching-room={highlighted ? "true" : undefined}
      className="rounded-3xl p-4 flex flex-col gap-3 mb-3"
      style={{ background: '#ffffff', border: highlighted ? '2px solid #F59E0B' : '1px solid rgba(15,23,42,0.08)', boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {highlighted && <p className="self-start rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{facadeSide ? 'Sunniest side for your sun moment' : 'Best room for your sun moment'}</p>}
      <div className="flex justify-between items-start gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50" aria-hidden="true">
            <ClayIcon name="hotel-views" size={40} />
          </span>
          <div className="min-w-0">
            <h4 className="text-[16px] font-extrabold leading-tight tracking-[-0.01em] text-slate-900">{display?.title ?? roomTitle(name)}</h4>
            <p className="mt-0.5 text-[12px] font-semibold text-slate-500">
              Level {floorLevel} · {typeof orientation === 'number' ? `faces ${directionWord(orientation)} (${Math.round(orientation)}°)` : `${orientation} facing`}
            </p>
            {today && <p className="mt-1 text-[12px] font-medium text-slate-600">{formatGuestDate(`${today}T12:00:00Z`, 'UTC')} · {timeZone === DEFAULT_TIME_ZONE ? 'Melbourne time' : 'Venue local time'}</p>}
          </div>
        </div>
        {baseNightlyRateDemo != null && baseNightlyRateDemo !== '' && <div className="text-right shrink-0">
          <span className="font-black text-slate-800">${baseNightlyRateDemo}</span>
          <span className="text-slate-500 text-[10px] block">/ night</span>
        </div>}
      </div>
      {display?.chip ? <p className="self-start rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800" title={display.trustLine}>{display.chip}</p>
        : display ? <p className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600" title={roomSourceLabel(room) ?? display.trustLine}>{display.evidenceLabel}</p> : null}

      {daily ? (
        <div className="flex flex-col gap-3">
          <SunMomentsPanel daily={daily} summary={sunMomentsFromDay({ daily, forecast, timeZone })} timeZone={timeZone} now={now} label={`potential ${exposureLabel}`} dayLabel={daily.date === venueLocalDate(now, timeZone) ? 'today' : `on ${formatGuestDate(`${daily.date}T12:00:00Z`, 'UTC')}`} />
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Sunniest months, representative 15th-of-month estimates">
            <span className="mr-1 inline-flex items-center gap-1 font-semibold text-slate-600"><ClayIcon name="sun-cloud" size={20} />Sunniest months</span>
            {months === undefined ? <span role="status" className="h-6 w-12 rounded-full bg-amber-100 motion-safe:animate-pulse"><span className="sr-only">Calculating sunniest months</span></span>
              : bestMonths?.length ? bestMonths.map(month => <span key={month} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-bold text-amber-900">{month}</span>)
              : <span className="text-slate-500">{months === null ? 'Unavailable' : 'No modelled direct sun'}</span>}
          </div>
          <p className="text-[12px] leading-relaxed text-slate-600">Sun-path and geometry estimates. {forecast ? 'Sky badges show forecasts.' : 'No weather forecast is shown here.'} Clouds, curtains and unrecorded shading can change the sun you experience.</p>
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
          {facadeSide ? 'Sun estimate unavailable for this side.' : 'Balcony sun unavailable.'} Check the {facadeSide ? 'side' : 'room'} bearing, coordinates, timezone and measured shading geometry.
        </p>
      )}
    </motion.div>
  );
}
