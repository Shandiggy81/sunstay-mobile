import React, { memo, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { X, Wind, Sun, Armchair, Flame, ExternalLink, Navigation, Share2 } from 'lucide-react';
import { getSunPositionForMap } from '../utils/sunPosition';
import { venues } from '../data/venues';
import WeatherWidget from './WeatherWidget';
import HourlyForecastStrip from './HourlyForecastStrip';
import LiveSunTimeline from './LiveSunTimeline';
import { getSunData } from '../utils/getSunData';
import { useOpenAQ } from '../hooks/useOpenAQ';
import { useTomorrowRain } from '../hooks/useTomorrowRain';
import { useOpenUV } from '../hooks/useOpenUV';
import { getWeatherGuaranteeQuote } from '../utils/weatherGuarantee';
import VenueCardWeather from './VenueCardWeather';
import VenueCardSun from './VenueCardSun';
import VenueCardActions from './VenueCardActions';
import WindComfortPanel from './WindComfortPanel';
import RoomSunCard from './RoomSunCard';
import { useWeather } from '../context/WeatherContext';
import { seedVenues } from '../data/seedVenues.js';
import { getVenueSunStatus, checkIfShaded, getSunWindow } from '../utils/solarMath.js';
import { calculateHourlyExposure } from '../utils/solarCalculator.js';


// ── Helpers ────────────────────────────────────────────────
const ACCOMMODATION_VIBES = [
  'hotel', 'airbnb', 'apartment', 'loft', 'penthouse',
  'suite', 'villa', 'resort', 'motel', 'hostel', 'bnb',
  'bed and breakfast', 'serviced', 'boutique hotel', 'accommodation',
  'stay', 'lodge', 'inn', 'townhouse', 'studio', 'warehouse loft',
];

function checkIsAccommodation(venue) {
  if (!venue) return false;
  const typeStr = (venue.type || '').toLowerCase();
  const vibeStr = (Array.isArray(venue.vibe) ? venue.vibe.join(' ') : (venue.vibe || '')).toLowerCase();
  if (typeStr.length > 0) return true;
  return ACCOMMODATION_VIBES.some(kw => vibeStr.includes(kw) || typeStr.includes(kw));
}

const getDeterministicSunHours = (id) => {
  const idString = String(id || 'default-id');
  let hash = 0;
  for (let i = 0; i < idString.length; i++) {
    hash = idString.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 6 + (Math.abs(hash) % 4);
};

const formatHourLabel = (hour) => {
  if (!Number.isFinite(hour)) return null;
  const rounded = Math.round(hour);
  if (rounded === 0 || rounded === 24) return '12am';
  if (rounded < 12) return `${rounded}am`;
  if (rounded === 12) return '12pm';
  return `${rounded - 12}pm`;
};

function calcOutdoorSun(venue, hourlyData) {
  if (!Array.isArray(hourlyData?.time) || !Number.isFinite(Number(venue?.lat)) || !Number.isFinite(Number(venue?.lng))) {
    return { balcony: 0, pool: 0 };
  }
  let b = 0, p = 0;
  for (let i = 0; i < hourlyData.time.length; i++) {
    const date = new Date(hourlyData.time[i]);
    if (Number.isNaN(date.getTime())) continue;
    const irrad = Number(hourlyData.direct_normal_irradiance?.[i]) || 0;
    const cc = Number(hourlyData.cloud_cover?.[i] ?? hourlyData.cloudcover?.[i]) || 0;
    const { altitude } = getSunPositionForMap(Number(venue.lat), Number(venue.lng), date);
    if (irrad > 200 && cc < 60) { if (altitude > 15) b++; if (altitude > 20) p++; }
  }
  return { balcony: b, pool: p };
}

const LiveSkyCondition = ({ cloudcover, windGusts, precipProbability = 0 }) => {
  if (cloudcover === undefined || cloudcover === null) return null;
  let sky = cloudcover < 30
    ? { label: 'Clear Skies & Direct Sun', emoji: '☀️' }
    : cloudcover <= 70
    ? { label: 'Partly Cloudy', emoji: '⛅' }
    : { label: 'Overcast', emoji: '☁️' };
  if (precipProbability > 85) sky = { label: 'Heavy Rain', emoji: '⛈️' };
  else if (precipProbability >= 50) sky = { label: 'Steady Rain', emoji: '🌧️' };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <span style={{ color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>{sky.emoji} {sky.label}</span>
      {windGusts > 0 && (
        <p style={{ color: '#64748B', fontSize: '11px', marginTop: '6px' }}>Wind gusts peaking at {Math.round(windGusts)} km/h</p>
      )}
    </div>
  );
};

const ShieldBar = ({ label, value, color, delay = 0 }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between">
      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#94A3B8' }}>{label}</span>
      <span className="text-[9px] font-black" style={{ color: '#64748B' }}>{Math.round(value * 100)}%</span>
    </div>
    <div className="h-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.07)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color.includes('0EA5E9') ? 'rgba(14,165,233,0.35)' : 'rgba(245,158,11,0.35)'}` }}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
      />
    </div>
  </div>
);

const BalconySunshineBlock = ({ balconyData, outdoorSun, isRainStartingSoon, minutesUntilRain, cloudcover }) => {
  if (!balconyData) return null;
  const sunHoursNum = outdoorSun?.balcony ?? balconyData?.hours ?? 0;
  const cloudPct = Array.isArray(cloudcover)
    ? cloudcover[new Date().getHours()] ?? cloudcover[0] ?? 0
    : typeof cloudcover === 'number' ? cloudcover : 0;
  const isSunNow = sunHoursNum > 0 && cloudPct < 70;
  const rainSoon = isRainStartingSoon && minutesUntilRain >= 0 && minutesUntilRain <= 60;
  const cloudSoon = cloudPct >= 50 && cloudPct < 80;
  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 24 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.span className="text-xl" animate={isSunNow ? { scale: [1, 1.2, 0.95, 1.15, 1], rotate: [-4, 4, -3, 3, 0] } : {}} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
            {isSunNow ? '☀️' : '🪟'}
          </motion.span>
          <div>
            <span className="text-[0.7rem] font-black uppercase tracking-widest block" style={{ color: isSunNow ? '#D97706' : '#64748B' }}>
              {balconyData.type === 'pool' ? 'Pool & Outdoor Area' : 'Balcony'}
            </span>
            <span className="font-black text-lg leading-tight" style={{ color: '#1E293B' }}>{sunHoursNum}h Sun Today</span>
          </div>
        </div>
        {isSunNow && (
          <motion.span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: '#F59E0B', color: '#fff' }} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>SUN NOW</motion.span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]" style={{ color: '#64748B' }}>
        {balconyData.direction && <span className="font-semibold">📍 {balconyData.direction} facing</span>}
        {balconyData.views && <span className="font-medium">{balconyData.views}</span>}
      </div>
      {rainSoon && (
        <motion.div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.22)' }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>🌧️</motion.span>
          <span className="font-bold text-[12px]" style={{ color: '#0369A1' }}>
            {minutesUntilRain === 0 ? 'Rain falling now — head inside' : `Rain approaching in ${minutesUntilRain} mins — grab a spot now`}
          </span>
        </motion.div>
      )}
      {!rainSoon && cloudSoon && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.20)' }}>
          <span>⛅</span>
          <span className="font-semibold text-[12px]" style={{ color: '#64748B' }}>Clouds building — {cloudPct}% cover right now</span>
        </div>
      )}
      {isSunNow && !rainSoon && !cloudSoon && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
          <span>✨</span>
          <span className="font-semibold text-[12px]" style={{ color: '#92400E' }}>Direct sunshine on the {balconyData.type === 'pool' ? 'pool deck' : 'balcony'} right now</span>
        </div>
      )}
    </motion.div>
  );
};

const RoomIntelligencePanel = ({ roomIntelligence }) => {
  if (!roomIntelligence) return null;
  const items = [
    roomIntelligence.sunriseView && { icon: '🌅', label: 'Sunrise View' },
    roomIntelligence.floorLevel && { icon: '🏢', label: `Floor ${roomIntelligence.floorLevel}` },
    roomIntelligence.poolAccess && { icon: '🏔', label: 'Pool Access' },
    roomIntelligence.balcony && { icon: '🪟', label: 'Private Balcony' },
  ].filter(Boolean);
  return (
    <motion.div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <span className="text-sky-600 text-[0.7rem] font-black uppercase tracking-widest block mb-2">🛎 Room Intelligence</span>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span>{item.icon}</span>
            <span className="text-[11px] font-semibold" style={{ color: '#475569' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const SolarExposureTimeline = memo(({ exposure }) => {
  const [activeIndex, setActiveIndex] = useState(null);

  if (!Array.isArray(exposure) || exposure.length === 0) return null;

  const directHours = exposure.filter(hour => hour.hasDirectSun).length;
  const peakIndex = exposure.reduce((bestIndex, hour, index, hours) => (
    hour.hasDirectSun && hour.altitude > (hours[bestIndex]?.altitude ?? -Infinity)
      ? index
      : bestIndex
  ), 0);
  const activeHour = activeIndex === null ? null : exposure[activeIndex];
  const statusLabel = activeHour
    ? `${activeHour.label}: ${activeHour.hasDirectSun
      ? activeIndex === peakIndex ? 'Direct Sun (Peak)' : 'Direct Sun'
      : 'Shaded by building'}`
    : 'Select an hour to see its direct sun status';

  return (
    <section
      className="mt-1 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-3.5"
      aria-labelledby="solar-exposure-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="solar-exposure-heading" className="text-[10px] font-black uppercase tracking-widest text-amber-800">
          Direct Sun · 8 AM–8 PM
        </h3>
        <span className="shrink-0 rounded-full border border-amber-200 bg-white px-2 py-1 text-[10px] font-black text-amber-700">
          ☀️ {directHours} hrs today
        </span>
      </div>

      <div className="mt-3 flex min-h-[44px] items-center gap-1.5" role="list" aria-label="Hourly direct sun exposure">
        {exposure.map((hour, index) => {
          const isActive = activeIndex === index;
          return (
            <button
              key={hour.hour}
              type="button"
              role="listitem"
              onClick={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onPointerDown={() => setActiveIndex(index)}
              className={`h-2 min-w-0 flex-1 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                hour.hasDirectSun ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'
              } ${isActive ? 'scale-y-150 shadow-sm' : 'hover:scale-y-125'}`}
              aria-label={`${hour.label}: ${hour.hasDirectSun ? 'Direct Sun' : 'Shaded'}`}
              aria-pressed={isActive}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between px-0.5 text-[9px] font-bold text-slate-500" aria-hidden="true">
        <span>8 AM</span>
        <span>12 PM</span>
        <span>4 PM</span>
        <span>8 PM</span>
      </div>

      <p className="mt-2 min-h-[18px] text-[11px] font-semibold text-slate-700" aria-live="polite">
        {activeHour ? statusLabel : 'Tap an hour for its direct sun status'}
      </p>
    </section>
  );
});
SolarExposureTimeline.displayName = 'SolarExposureTimeline';

// ── Sunstay Score Hero Badge ────────────────────────────────────
const WeatherUnavailableChip = ({ label = 'Weather temporarily unavailable' }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 w-full">
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 text-[12px] font-bold">
      {label}
    </span>
  </div>
);

const SunstayScoreSkeleton = () => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 w-full" aria-hidden="true">
    <div className="flex items-center gap-4">
      <div className="h-[62px] w-[62px] rounded-full animate-pulse bg-slate-200" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-3 w-28 animate-pulse bg-slate-200 rounded" />
        <div className="h-5 w-40 animate-pulse bg-slate-200 rounded" />
      </div>
    </div>
  </div>
);

const SunstayScoreBadge = ({ score, bestWindow, scoreLabel, unavailable }) => {
  if (unavailable || !Number.isFinite(score)) {
    return <WeatherUnavailableChip label="Score unavailable" />;
  }
  const pct = Math.round(Math.max(0, Math.min(100, score)));

  // Colour ramp: cold/poor → blue, mid → amber, high → emerald
  const { bg, border, text, fill, glow } = pct >= 75
    ? { bg: 'rgba(16,185,129,0.09)', border: 'rgba(16,185,129,0.35)', text: '#065F46', fill: '#10B981', glow: 'rgba(16,185,129,0.15)' }
    : pct >= 50
    ? { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.35)', text: '#92400E', fill: '#F59E0B', glow: 'rgba(245,158,11,0.15)' }
    : { bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.28)', text: '#0C4A6E', fill: '#0EA5E9', glow: 'rgba(14,165,233,0.12)' };

  const emoji = pct >= 75 ? '☀️' : pct >= 50 ? '🌤️' : '🌥️';
  const label = scoreLabel || (pct >= 75 ? 'Peak Comfort' : pct >= 50 ? 'Good Conditions' : 'Worth a Look');

  // Best window line (only show if there is a meaningful future window)
  const showWindow = bestWindow?.type === 'FUTURE_WINDOW' && bestWindow.startsInHours > 0;

  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4 w-full"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.08 }}
    >
      {/* Circular score ring */}
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 62, height: 62 }}>
        <svg width="62" height="62" viewBox="0 0 62 62" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="31" cy="31" r="26" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
          <motion.circle
            cx="31" cy="31" r="26" fill="none"
            stroke={fill} strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 26}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 26 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 26 * (1 - pct / 100) }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[16px] font-black leading-none" style={{ color: text }}>{pct}</span>
        </div>
      </div>

      {/* Labels */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[0.72rem] font-black uppercase tracking-widest" style={{ color: text }}>Sunstay Score</span>
          <span className="text-lg leading-none">{emoji}</span>
        </div>
        <span className="text-lg font-black leading-tight" style={{ color: '#1E293B' }}>{label}</span>
        {showWindow && (
          <motion.span
            className="text-[12px] font-bold leading-tight mt-0.5"
            style={{ color: text }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            {`☀️ Golden window starts in ${bestWindow.startsInHours}h`}
          </motion.span>
        )}
        {!showWindow && bestWindow?.type === 'CURRENT_PEAK' && (
          <motion.span
            className="text-[12px] font-bold leading-tight mt-0.5"
            style={{ color: '#065F46' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            ✨ Peak comfort right now
          </motion.span>
        )}
      </div>
    </motion.div>
  );
};

// ── Collapsible Deep Dive Accordion ──────────────────────────────
const DetailedForecastAccordion = ({ lat, lng, venue, uvIndex, aqLabel, wind, children }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-2 mt-1 w-full">
      <motion.button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-200 select-none"
        style={{
          background: isExpanded ? 'rgba(14,165,233,0.10)' : 'rgba(14,165,233,0.04)',
          borderColor: isExpanded ? 'rgba(14,165,233,0.25)' : 'rgba(14,165,233,0.12)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        whileHover={{ scale: 1.01, background: 'rgba(14,165,233,0.08)' }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/10 border border-sky-500/20 text-base flex-shrink-0">
            📊
          </span>
          <div>
            <span className="text-[14px] font-extrabold text-slate-900 block leading-tight">
              Detailed Forecast & Intelligence
            </span>
            <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
              {isExpanded ? 'Tap to hide detailed forecast' : 'Tap for detailed forecast'}
            </span>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-200/60 text-slate-700 flex-shrink-0"
        >
          <span style={{ fontSize: 11, fontWeight: 'bold' }}>▼</span>
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: 'easeInOut' }}
            className="overflow-hidden flex flex-col gap-3 pt-1 pb-1"
          >
            {/* Secondary Metrics (UV, Wind, & Pristine Air) */}
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-4 px-4 scrollbar-hide">
              <div className="flex items-center gap-3 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm shrink-0 min-w-[140px]" style={{ minHeight: '44px' }}>
                <span className="text-xl flex-shrink-0">🔆</span>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 block">UV Index</span>
                  <span className="text-[15px] font-extrabold text-slate-900 block mt-0.5">{uvIndex ?? '–'}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm shrink-0 min-w-[140px]" style={{ minHeight: '44px' }}>
                <span className="text-xl flex-shrink-0">🌬️</span>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 block">Wind</span>
                  <span className="text-[15px] font-extrabold text-slate-900 block mt-0.5">{wind !== undefined ? `${Math.round(wind)} km/h` : '–'}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl border bg-white border-slate-100 shadow-sm shrink-0 min-w-[140px]" style={{ minHeight: '44px' }}>
                <span className="text-xl flex-shrink-0">🌿</span>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 block">Air Quality</span>
                  <span className="text-[15px] font-extrabold text-slate-900 block mt-0.5 truncate">{aqLabel ?? '–'}</span>
                </div>
              </div>
            </div>

            {/* Hourly Comfort Forecast */}
            {lat && lng && (
              <div className="rounded-2xl overflow-hidden border" style={{ background: 'rgba(14,165,233,0.04)', borderColor: 'rgba(14,165,233,0.12)' }}>
                <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                  <span className="text-[0.72rem] font-black uppercase tracking-widest text-slate-700">Hourly Comfort Forecast</span>
                </div>
                <HourlyForecastStrip lat={lat} lng={lng} dark />
              </div>
            )}

            {/* Wind & Comfort Intelligence */}
            <WindComfortPanel venue={venue} />
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function resolveVenueWebsiteUrl(venue) {
  const raw = venue?.official_website_url || venue?.website_url || venue?.website || venue?.url;
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return url || null;
}

const footerActionClass =
  'flex flex-1 items-center justify-center gap-1 min-h-[44px] px-2 rounded-xl text-[12px] font-bold leading-tight text-center transition-transform active:scale-[0.98]';

function VenueCardFooterActions({ venue, canNavigate }) {
  const [shareLabel, setShareLabel] = useState('Share');
  const copiedTimerRef = useRef(null);
  const websiteUrl = resolveVenueWebsiteUrl(venue);
  const destLat = Number(venue?.lat);
  const destLng = Number(venue?.lng);
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`
    : null;

  React.useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  async function handleShare() {
    if (!websiteUrl) return;
    const title = venue?.name || venue?.venueName || '';
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title,
          text: 'Check out this spot on Sunstay!',
          url: websiteUrl,
        });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(websiteUrl);
        setShareLabel('Copied!');
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setShareLabel('Share'), 2000);
      }
    } catch {
      // Soft fail when clipboard is unavailable.
    }
  }

  return (
    <div className="flex flex-row gap-2">
      {websiteUrl ? (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${footerActionClass} bg-white text-slate-800 border border-slate-200`}
        >
          <ExternalLink size={14} aria-hidden="true" />
          Website
        </a>
      ) : (
        <span
          className={`${footerActionClass} bg-white text-slate-800 border border-slate-200 opacity-40 pointer-events-none`}
          aria-disabled="true"
        >
          <ExternalLink size={14} aria-hidden="true" />
          Website
        </span>
      )}

      {directionsUrl ? (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${footerActionClass} bg-amber-500 text-[#0F172A] shadow-sm`}
          aria-label="Get Directions"
        >
          <Navigation size={14} aria-hidden="true" />
          Get Directions
        </a>
      ) : (
        <button
          type="button"
          disabled
          className={`${footerActionClass} bg-amber-500 text-[#0F172A] shadow-sm opacity-40 cursor-not-allowed`}
          aria-label="Get Directions unavailable"
        >
          <Navigation size={14} aria-hidden="true" />
          Get Directions
        </button>
      )}

      <button
        type="button"
        onClick={handleShare}
        disabled={!websiteUrl}
        className={`${footerActionClass} bg-white text-slate-800 border border-slate-200 disabled:opacity-40 disabled:pointer-events-none`}
        aria-label={shareLabel === 'Copied!' ? 'Copied!' : 'Share venue'}
      >
        <Share2 size={14} aria-hidden="true" />
        {shareLabel}
      </button>
    </div>
  );
}

// ── Main VenueCard ────────────────────────────────────────────
function VenueCard({ venue, weather, onClose, onCenter, cozyWeatherActive, setShowOwnerDashboard, setSelectedVenue, liveVenueFeatures }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [localSunData, setLocalSunData] = useState(null);
  const [sunWindow, setSunWindow] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  React.useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [venue?.id]);

  React.useEffect(() => {
    const venueLat = Number(venue?.lat);
    const venueLng = Number(venue?.lng);
    if (venue && Number.isFinite(venueLat) && Number.isFinite(venueLng)
      && venueLat >= -90 && venueLat <= 90 && venueLng >= -180 && venueLng <= 180) {
      // Use fallback obstacle data if venue doesn't have it
      const obstacleHeight = venue.obstacle_height ?? 2;
      const obstacleDistance = venue.obstacle_distance ?? 1;

      setLocalSunData(getVenueSunStatus(venueLat, venueLng));
      setSunWindow(getSunWindow(venueLat, venueLng, obstacleHeight, obstacleDistance));
      return;
    }
    setLocalSunData(null);
    setSunWindow(null);
  }, [venue]);

  const dragControls = useDragControls();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-4, 4]), { stiffness: 200, damping: 25 });
  const cardRectRef = useRef(null);

  // Pull live cozy-index + best window from Open-Meteo-backed context.
  // getSunstayScoreResult already includes settled TOD previewMinutes.
  const {
    weather: weatherData,
    loading: weatherLoading,
    error: weatherError,
    unavailable: weatherUnavailableFlag,
    calculateSunstayScore,
    getSunstayScoreResult,
    getBestWindow,
  } = useWeather();
  const weatherUnavailable = Boolean(
    weatherUnavailableFlag
    || weatherError
    || weatherData?.unavailable
    || weatherData?.source === 'demo'
  );
  const contextCloudCover = weatherData?.cloudCoverPct ?? weatherData?.clouds?.all;
  const contextIsRaining = (Number(weatherData?.precipitation) || 0) > 0
    || /rain|drizzle|thunder/i.test(String(weatherData?.weather?.[0]?.main ?? ''));

  function handlePointerEnter(e) { cardRectRef.current = e.currentTarget.getBoundingClientRect(); }
  function handlePointerMove(e) {
    const rect = cardRectRef.current;
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function handlePointerLeave() { cardRectRef.current = null; mouseX.set(0); mouseY.set(0); }

  const safeVenue = venue || {};
  const { name, type, suburb, lat, lng, balconyData, heating, vibe = [], tags = [] } = safeVenue;
  // shielding is a JSONB column — Supabase may return null instead of {} after migration
  const shielding = safeVenue.shielding && typeof safeVenue.shielding === 'object' ? safeVenue.shielding : null;
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeVibes = Array.isArray(vibe) ? vibe : (vibe ? [vibe] : []);
  const fallbackName = venue?.venueName ?? venue?.name ?? venue?.title ?? 'Unnamed venue';
  const displayName = fallbackName;
  const isHotelOrStay = checkIsAccommodation(venue);
  const venueImage = venue?.image_url ?? venue?.imageUrl ?? venue?.image ?? venue?.hero_image ?? venue?.photoUrl ?? venue?.photo;
  const showVenueImage = Boolean(venueImage) && !imageError;
  const showHeroSkeleton = weatherLoading || (showVenueImage && !imageLoaded);

  const hourlyData = weather?.rawWeather?.hourly ?? (weather?.rawWeather?.time ? weather.rawWeather : null) ?? null;
  const temp       = weather?.rawWeather?.temp ?? weather?.main?.temp ?? weather?.temp ?? 22;
  const wind       = weather?.rawWeather?.wind ?? weather?.wind?.speed ?? 0;
  const scoreResult = (!weatherLoading && !weatherUnavailable && typeof getSunstayScoreResult === 'function')
    ? getSunstayScoreResult(venue)
    : (weatherUnavailable ? { score: null, label: 'Score unavailable', unavailable: true } : null);
  const contextScore = scoreResult?.unavailable
    ? null
    : (Number.isFinite(scoreResult?.score)
      ? scoreResult.score
      : (!weatherUnavailable && typeof calculateSunstayScore === 'function' ? calculateSunstayScore(venue) : null));
  const fallbackScore = Number.isFinite(weather?.score)
    ? weather.score
    : (Number.isFinite(weather?.rawWeather?.score) ? weather.rawWeather.score : null);
  const score = weatherLoading || weatherUnavailable
    ? null
    : (Number.isFinite(contextScore) ? contextScore : fallbackScore);
  const uvIndex    = weather?.rawWeather?.uvIndex ?? venue?.weatherNow?.uvIndex ?? 3;
  const precipProb = weather?.rawWeather?.precipProb ?? venue?.weatherNow?.precipProb ?? 0;
  const feelsLike  = weather?.rawWeather?.feelsLike ?? temp;
  const { weatherCode } = weather || {};
  const { aqLabel } = useOpenAQ(lat, lng);
  const windSpeedValue = venue?.windSpeed ?? weatherData?.windSpeed ?? weather?.windSpeed ?? weather?.rawWeather?.windSpeed;
  const windSpeedDisplay = windSpeedValue != null
    ? (typeof windSpeedValue === 'number' ? `${Math.round(windSpeedValue)} km/h` : windSpeedValue)
    : '18 km/h';
  const windbreak = Number(shielding?.windbreak);
  const windShelter = typeof venue?.windShelter === 'string'
    ? venue.windShelter
    : Number.isFinite(windbreak)
      ? windbreak >= 70 ? 'Protected' : windbreak >= 40 ? 'Moderate Shelter' : 'Open Exposure'
      : 'Moderate Shelter';
  const uvValue = venue?.uvIndex ?? weatherData?.uvIndex ?? weather?.uvIndex ?? weather?.rawWeather?.uvIndex ?? uvIndex ?? 4;
  const uvGuideline = Number(uvValue) >= 7 ? 'High' : Number(uvValue) >= 3 ? 'Moderate' : 'Low';
  const seatingLayout = venue?.seating_type ?? venue?.seatingType ?? (
    safeVibes.some(v => String(v).toLowerCase().includes('courtyard')) ? 'Courtyard' : 'Outdoor Seating'
  );
  const hasCoveredSeating = Boolean(
    venue?.coveredOutdoor ??
    venue?.covered_outdoor ??
    venue?.hasCover ??
    (Number.isFinite(Number(shielding?.rainCover)) && Number(shielding.rainCover) >= 60) ??
    safeTags.some(tag => String(tag).toLowerCase().includes('covered'))
  );
  const outdoorComfort = venue?.hasHeating || venue?.heating
    ? 'Heated & Covered'
    : 'Open Courtyard';
  const outdoorAspect = String(
    venue?.outdoorZone?.aspect
      ?? venue?.outdoor_aspect
      ?? venue?.outdoorAspect
      ?? venue?.balcony_facing
      ?? 'open',
  ).toLowerCase().replace(/[^a-z]/g, '');
  const outdoorMinAltitude = venue?.outdoorZone?.minAltitude ?? venue?.minAltitude ?? 15;
  const hasValidCoordinates = Number.isFinite(Number(lat))
    && Number.isFinite(Number(lng))
    && Number(lat) >= -90 && Number(lat) <= 90
    && Number(lng) >= -180 && Number(lng) <= 180;
  const solarExposure = useMemo(
    () => hasValidCoordinates
      ? calculateHourlyExposure(Number(lat), Number(lng), new Date(), {
          aspect: ['north', 'south', 'east', 'west', 'open'].includes(outdoorAspect)
            ? outdoorAspect
            : 'open',
          minAltitude: outdoorMinAltitude,
        })
      : [],
    [hasValidCoordinates, lat, lng, outdoorAspect, outdoorMinAltitude],
  );
  const heatingLabel = venue?.hasHeating || venue?.heating ? 'Heated Lamps' : 'Natural Breeze';
  const { burnTimeMins } = useOpenUV(lat, lng);
  const cloudcover = weather?.cloudCover
    ?? (Array.isArray(hourlyData?.cloud_cover) ? hourlyData.cloud_cover : null)
    ?? (Array.isArray(hourlyData?.cloudcover) ? hourlyData.cloudcover : null);

  const _currentHour = new Date().getHours();
  const windGusts = weather?.windGusts
    ?? (Array.isArray(hourlyData?.wind_gusts_10m) ? (hourlyData.wind_gusts_10m[_currentHour] ?? hourlyData.wind_gusts_10m[0] ?? 0) * 3.6 : null)
    ?? (Array.isArray(hourlyData?.windgusts_10m) ? (hourlyData.windgusts_10m[_currentHour] ?? hourlyData.windgusts_10m[0] ?? 0) : null);

  const precipProbability = weather?.precipProbability ?? precipProb ?? 0;
  const sunshineMins = weather?.sunshineDuration ? Math.round(weather.sunshineDuration / 60) : null;
  const daylightHours = weather?.daylightDuration ? Math.round(weather.daylightDuration / 3600) : null;
  const maxTemp = weather?.maxTemp ?? null;
  const minTemp = weather?.minTemp ?? null;

  // All four values — isRainStartingSoon + minutesUntilRain feed BalconySunshineBlock
  // and VenueCardActions; rainArrivalMins + rainArrivalLabel feed the nowcast banner
  const { isRainStartingSoon, minutesUntilRain, rainArrivalMins, rainArrivalLabel } = useTomorrowRain(lat, lng);

  const sunData = useMemo(() => (lat && lng) ? getSunData(lat, lng) : null, [lat, lng]);
  const outdoorSun = useMemo(() => isHotelOrStay ? calcOutdoorSun(venue, hourlyData) : { balcony: 0, pool: 0 }, [venue, hourlyData, isHotelOrStay]);
  const sunHours = useMemo(() => {
    if (isHotelOrStay && (outdoorSun.balcony > 0 || outdoorSun.pool > 0))
      return { outdoor: `${outdoorSun.balcony}h`, covered: `${outdoorSun.pool}h`, labels: { outdoor: 'Balcony', covered: 'Pool' } };
    const sunHoursFallback = getDeterministicSunHours(venue?.id);
    return { outdoor: `${sunHoursFallback}h`, covered: `${Math.max(4, sunHoursFallback - 2)}h`, labels: { outdoor: 'Outdoor', covered: 'Covered' } };
  }, [isHotelOrStay, outdoorSun, venue?.id]);
  const directSunHours = Number.parseFloat(sunHours.outdoor) || 0;
  const peakSunWindow = useMemo(() => {
    const start = formatHourLabel(sunData?.startHour);
    const end = formatHourLabel(sunData?.endHour);
    return start && end ? `${start} – ${end}` : null;
  }, [sunData]);

  const weatherCondition = useMemo(() => {
    if (weather?.weather?.[0]?.main) return weather.weather[0].main.toLowerCase();
    const code = weather?.rawWeather?.weatherCode;
    if (code >= 51 && code <= 95) return 'rain';
    if (code >= 1 && code <= 3) return 'cloudy';
    return 'clear';
  }, [weather]);
  const isRain = weatherCondition.includes('rain') || weatherCondition.includes('shower');

  const getWeatherDisplay = useMemo(() => {
    const code = weather?.rawWeather?.weatherCode ?? weatherCode;
    if (code === 0) return { emoji: '☀️', label: 'Brilliant Sun' };
    if (code === 1) return { emoji: '🌤️', label: 'Mostly Sunny' };
    if (code === 2) return { emoji: '⛅', label: 'Partly Cloudy' };
    if (code === 3) return { emoji: '☁️', label: 'Overcast' };
    if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Foggy' };
    if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Drizzle' };
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧️', label: 'Raining' };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { emoji: '❄️', label: 'Snow' };
    if (code >= 95) return { emoji: '⛈️', label: 'Storm' };
    if (weatherCondition === 'clear') return { emoji: '☀️', label: 'Brilliant Sun' };
    if (weatherCondition.includes('cloud')) return { emoji: '⛅', label: 'Partly Cloudy' };
    if (weatherCondition.includes('rain') || weatherCondition.includes('shower')) return { emoji: '🌧️', label: 'Raining' };
    if (weatherCondition.includes('snow')) return { emoji: '❄️', label: 'Snow' };
    if (weatherCondition.includes('thunder') || weatherCondition.includes('storm')) return { emoji: '⛈️', label: 'Storm' };
    if (weatherCondition.includes('fog') || weatherCondition.includes('mist')) return { emoji: '🌫️', label: 'Foggy' };
    return { emoji: '🌡️', label: 'Checking...' };
  }, [weather, weatherCode, weatherCondition]);

  const lookupName = String(displayName || name || '').toLowerCase();
  const fullVenueData = lookupName
    ? venues.find(v => { const c = String(v.name || v.venueName || '').toLowerCase(); return c && (lookupName.includes(c) || c.includes(lookupName)); })
    : null;
  const actualHappyHour = venue?.happyHour ?? fullVenueData?.happyHour;
  const roomIntelligence = venue?.roomIntelligence || fullVenueData?.roomIntelligence;

  // Dynamic Tab Pruning: only display tabs with valid, non-empty data
  const availableTabs = useMemo(() => {
    const tabs = ['Overview'];

    const hasSunData = Boolean(
      localSunData ||
      sunData ||
      balconyData ||
      (isHotelOrStay && (outdoorSun?.balcony > 0 || outdoorSun?.pool > 0))
    );
    if (hasSunData) {
      tabs.push('Sun Forecast');
    }

    const hasRooms = Boolean(
      isHotelOrStay && (
        (Array.isArray(venue?.roomTypes) && venue.roomTypes.length > 0) ||
        roomIntelligence
      )
    );
    if (hasRooms) {
      tabs.push('Rooms');
    }

    const hasHappyHour = Boolean(
      actualHappyHour && (
        actualHappyHour.deal ||
        (Array.isArray(actualHappyHour.days) && actualHappyHour.days.length > 0) ||
        actualHappyHour.start
      )
    );
    if (hasHappyHour) {
      tabs.push('Happy Hour');
    }

    const hasAmenities = Boolean(
      shielding ||
      (safeTags && safeTags.length > 0) ||
      weather
    );
    if (hasAmenities) {
      tabs.push('Amenities');
    }

    return tabs;
  }, [localSunData, sunData, balconyData, isHotelOrStay, outdoorSun, venue?.roomTypes, roomIntelligence, actualHappyHour, shielding, safeTags, weather]);

  // Safety fallback: if activeTab was pruned out for this venue, reset to first available tab
  React.useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] || 'Overview');
    }
  }, [availableTabs, activeTab]);

  const verdict = useMemo(() => {
    if (weatherLoading) return { icon: '☁️', text: 'Checking conditions', color: '#94A3B8' };
    if (weatherUnavailable) return { icon: '☁️', text: 'Weather temporarily unavailable', color: '#64748B' };
    const currentHour = new Date().getHours();
    const isNight = currentHour >= 20 || currentHour < 6;
    const cloudNow = Array.isArray(cloudcover) ? (cloudcover[currentHour] ?? cloudcover[0] ?? 0) : (typeof cloudcover === 'number' ? cloudcover : 50);
    if (isNight) {
      if (precipProbability >= 30) return { icon: '🌧️', text: 'Rainy night', color: '#0EA5E9' };
      if (cloudNow > 40) return { icon: '☁️', text: 'Cloudy night', color: '#64748B' };
      return { icon: '🌙', text: 'Clear night', color: '#64748B' };
    }
    if (precipProb > 85) return { icon: '⛈️', text: 'Heavy Rain — Check Cover', color: '#0EA5E9' };
    if (precipProb >= 50) return { icon: '🌧️', text: 'Steady Rain — Check Cover', color: '#0EA5E9' };
    if (precipProb > 30) return { icon: '🌧️', text: 'Wet Conditions — Check Cover', color: '#0EA5E9' };
    if (wind > 30)       return { icon: '🌬️', text: 'High Wind — Sit Indoors', color: '#94A3B8' };
    if (cloudNow > 70)   return { icon: '☁️',  text: 'Overcast — Cosy Vibes Today', color: '#64748B' };
    if (cloudNow > 40)   return { icon: '⛅',  text: 'Partly Cloudy — Some Sun Breaks', color: '#94A3B8' };
    if (Number.isFinite(score) && score > 75)      return { icon: '☀️',  text: 'Prime Outdoor Conditions', color: '#F59E0B' };
    if (Number.isFinite(score) && score >= 50)     return { icon: '🌤️',  text: 'Good Afternoon Sun Expected', color: '#0EA5E9' };
    return               { icon: '☁️',  text: 'Overcast — Cosy Vibes Today', color: '#64748B' };
  }, [precipProb, precipProbability, wind, score, cloudcover, weatherLoading, weatherUnavailable]);

  const scoreLabel = useMemo(() => {
    if (weatherUnavailable || !Number.isFinite(score)) return 'Score unavailable';
    if (scoreResult?.label) return scoreResult.label;
    if (score > 75) return 'Perfect Now';
    if (score >= 50) return 'Good Choice';
    return 'Worth a Look';
  }, [score, scoreResult?.label, weatherUnavailable]);
  const scoreMeaningLabel = useMemo(() => {
    if (!Number.isFinite(score)) return 'Score unavailable';
    if (score >= 75) return 'Great conditions';
    if (score >= 50) return 'Decent today';
    return 'Not ideal';
  }, [score]);

  const displaySunrise = useMemo(() => {
    if (venue?.sunrise) return venue.sunrise;
    if (weather?.sys?.sunrise) return new Date(weather.sys.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return '--';
  }, [venue?.sunrise, weather?.sys?.sunrise]);
  const displaySunset = useMemo(() => {
    if (venue?.sunset) return venue.sunset;
    if (weather?.sys?.sunset) return new Date(weather.sys.sunset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return '--';
  }, [venue?.sunset, weather?.sys?.sunset]);

  const peakStartDecimal = Number.isFinite(sunData?.startHour) ? sunData.startHour : null;
  const peakEndDecimal   = Number.isFinite(sunData?.endHour)   ? sunData.endHour   : null;

  // Compute best window once per render (stable — getBestWindow reads from context weather)
  const bestWindow = useMemo(
    () => typeof getBestWindow === 'function' ? getBestWindow(8, venue) : null,
    [getBestWindow, venue]
  );

  const blobA = isRain ? 'rgba(14,165,233,0.12)' : 'rgba(245,158,11,0.10)';
  const blobB = isRain ? 'rgba(99,102,241,0.07)' : 'rgba(14,165,233,0.08)';
  const liveFeaturesForVenue = venue?.id ? liveVenueFeatures?.[venue.id] : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        className="fixed inset-x-0 bottom-0 top-[calc(132px+env(safe-area-inset-top,0px))] z-[110] flex flex-col overflow-hidden bg-black/50"
        onClick={onClose}
      >
        <motion.article
          aria-label={fallbackName}
          onClick={e => e.stopPropagation()}
          drag="y" dragControls={dragControls} dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.15}
          onDragEnd={(_, i) => { if (i.offset.y > 100 || i.velocity.y > 400) onClose(); }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          style={{
            rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1200,
            boxShadow: '0 -8px 60px rgba(0,0,0,0.12), 0 -2px 12px rgba(14,165,233,0.08), inset 0 1px 0 rgba(255,255,255,1)',
            border: '1px solid rgba(14,165,233,0.12)',
          }}
          className="pointer-events-auto relative z-50 flex h-full min-h-0 w-full select-none flex-col overflow-hidden rounded-t-3xl bg-white"
          onPointerEnter={handlePointerEnter}
          onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: '28px 28px 0 0', zIndex: 0 }}>
            <motion.div animate={{ scale: [1, 1.18, 1], x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${blobA} 0%, transparent 65%)`, filter: 'blur(48px)' }} />
            <motion.div animate={{ scale: [1, 1.12, 1], x: [0, -30, 0], y: [0, 20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }} style={{ position: 'absolute', bottom: '15%', left: -60, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${blobB} 0%, transparent 65%)`, filter: 'blur(56px)' }} />
          </div>

          <div className="relative z-20 isolate shrink-0 overflow-hidden bg-white px-4 [transform-style:flat]">
            {/* 1. Extracted Drag Handle for top of sheet */}
            <div
              className="flex justify-center pt-1 pb-3 md:hidden w-full"
              onPointerDown={e => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(14,165,233,0.35)' }} />
            </div>

            {/* 2. Sticky title chrome — Title, Subtitle, Close */}
            <div className="sticky top-0 z-20 bg-white pt-4 pb-2 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-slate-900 leading-tight truncate">{fallbackName}</h2>
                <p className="text-sm text-slate-600 font-medium truncate">
                  {safeVibes.length ? `${safeVibes.join(', ')} · ${suburb}` : suburb}
                </p>
              </div>
              <motion.button
                onClick={onClose}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center p-3 bg-white text-slate-900 shadow-md rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-900"
                whileTap={{ scale: 0.92 }}
                aria-label="Close venue details"
              >
                <X size={18} />
              </motion.button>
            </div>
          </div>

          <div
            className="relative z-10 isolate min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 flex flex-col gap-2 bg-white [transform-style:flat]"
          >
            {/* Hero image */}
            <div className="relative w-full h-48 sm:h-56 min-h-[12rem] sm:min-h-[14rem] overflow-hidden shrink-0 bg-slate-200 rounded-t-2xl mb-1">
              {/* Background image / gradient layer */}
              <div className="absolute inset-0 z-0">
                {showVenueImage ? (
                  <img
                    src={venueImage}
                    alt={fallbackName}
                    className={`absolute inset-0 w-full h-full object-cover ${imageLoaded ? 'opacity-70' : 'opacity-0'}`}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => { setImageError(true); setImageLoaded(false); }}
                  />
                ) : null}
                {!showVenueImage && !showHeroSkeleton ? (
                  <div
                    className="relative flex w-full h-full flex-col items-center justify-center overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 40%, #0F766E 75%, #D97706 100%)' }}
                  >
                    <div
                      className="absolute w-52 h-52 rounded-full pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle, rgba(245,158,11,0.22) 0%, rgba(14,165,233,0.12) 50%, transparent 70%)',
                        filter: 'blur(30px)',
                      }}
                    />
                    <div className="relative z-10 w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg mb-2">
                      <svg className="w-9 h-9 text-amber-300 drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.3" />
                        <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                      </svg>
                    </div>
                    <span className="relative z-10 text-[11px] font-black uppercase tracking-widest text-amber-200/90 drop-shadow-sm">
                      SunStay Melbourne
                    </span>
                    <span className="relative z-10 text-[10px] font-semibold text-slate-300/80 mt-0.5">
                      {safeVenue?.suburb || 'Solar Intelligence'}
                    </span>
                  </div>
                ) : null}
                {showHeroSkeleton && (
                  <div className="absolute inset-0 z-[1] animate-pulse bg-slate-200" aria-hidden="true" />
                )}
              </div>
            </div>

            {/* Map Centre Action & Signal Line */}
            <div className="flex items-center justify-between gap-4 mb-2 px-1 shrink-0">
              <div className="flex items-center gap-2 text-slate-800">
                <span className="text-xl">{verdict.icon}</span>
                <span className="font-bold text-sm">{verdict.text}</span>
              </div>
              {onCenter && (
                <button
                  onClick={() => onCenter(venue)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-sky-50 text-sky-700 border border-sky-100 font-bold text-sm shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                  style={{ minWidth: 44, minHeight: 44 }}
                  aria-label="Centre on map"
                >
                  <span>📍</span> Centre on map
                </button>
              )}
            </div>

            {/* Tabbed Navigation (Dynamically Pruned) */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide border-b border-slate-200 bg-slate-50 pt-1 pb-0 mb-4 px-1 shrink-0">
              {availableTabs.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`min-h-[44px] px-3.5 py-2 text-sm font-black whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                    activeTab === tab
                      ? 'text-amber-600 border-amber-500'
                      : 'text-slate-500 border-transparent hover:text-slate-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex flex-col gap-4 pb-4">
              {activeTab === 'Overview' && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3">
                    {Number.isFinite(directSunHours) && (
                      <span className="font-black text-amber-500 text-lg">
                        {directSunHours.toFixed(1)} hours direct sun today
                      </span>
                    )}
                    {peakSunWindow && (
                      <span className="font-bold text-amber-700 text-sm">
                        ☀️ Peak sun: {peakSunWindow}
                      </span>
                    )}
                    {(() => {
                      const isOutdoor = !!(venue?.outdoorArea || venue?.rooftop || venue?.beerGarden || venue?.balcony || venue?.outdoorSeating);
                      if (!isOutdoor) return null;
                      const quote = getWeatherGuaranteeQuote({
                        bookingValue: venue?.bookingPrice || 120,
                        rainProbability: weather?.precipProbability ?? 0,
                        expectedRainMm: weather?.rainMm ?? 0,
                        cloudCover: weather?.cloudCover ?? 0,
                        isOutdoor,
                      });
                      if (!quote) return null;
                      return (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          marginTop: 4,
                          padding: '4px 10px', borderRadius: 999,
                          background: 'rgba(15,15,30,0.04)',
                          border: `1px solid ${quote.riskColor}44`,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: quote.riskColor, display: 'inline-block' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: quote.riskColor, letterSpacing: '0.04em' }}>
                            {quote.riskBand} Rain Risk
                          </span>
                          <span style={{ fontSize: 11, color: '#64748B', marginLeft: 2 }}>
                            · Guarantee available
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {weatherLoading ? (
                    <SunstayScoreSkeleton />
                  ) : (
                    <SunstayScoreBadge
                      score={score}
                      bestWindow={weatherUnavailable ? null : bestWindow}
                      scoreLabel={scoreLabel}
                      unavailable={weatherUnavailable || !Number.isFinite(score)}
                    />
                  )}

                  {/* Microclimate Grid */}
                  <div className="grid grid-cols-2 gap-2.5 my-3">
                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 flex flex-col justify-between min-h-[82px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Wind & Shelter</span>
                        <Wind size={14} className="text-sky-600 shrink-0" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block truncate">{windSpeedDisplay}</span>
                        <span className="text-[10px] font-medium text-slate-500 block truncate">{windShelter}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 flex flex-col justify-between min-h-[82px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">UV & Solar</span>
                        <Sun size={14} className="text-amber-500 shrink-0" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block truncate">UV {uvValue}</span>
                        <span className="text-[10px] font-medium text-slate-500 block truncate">{uvGuideline}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 flex flex-col justify-between min-h-[82px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Seating Layout</span>
                        <Armchair size={14} className="text-slate-600 shrink-0" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block truncate">{seatingLayout}</span>
                        <span className="text-[10px] font-medium text-slate-500 block truncate">
                          {hasCoveredSeating ? 'Covered' : 'Open Air'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2.5 flex flex-col justify-between min-h-[82px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Heating / Cozy</span>
                        <Flame size={14} className="text-orange-500 shrink-0" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 block truncate">{heatingLabel}</span>
                        <span className="text-[10px] font-medium text-slate-500 block truncate">{outdoorComfort}</span>
                      </div>
                    </div>
                  </div>

                  <SolarExposureTimeline exposure={solarExposure} />

                  {rainArrivalMins !== null && rainArrivalMins <= 45 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl border"
                      style={{
                        background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)',
                        borderColor: '#F59E0B',
                        boxShadow: '0 4px 14px rgba(245,158,11,0.06)',
                      }}
                    >
                      <div className="flex items-center justify-center text-xl bg-amber-500/10 p-2 rounded-xl border border-amber-500/20 flex-shrink-0">
                        🛰️
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 block">
                          Predictive Radar Alert
                        </span>
                        <p className="text-sm font-black text-slate-900 leading-tight mt-0.5">
                          {rainArrivalLabel}
                        </p>
                        <span className="text-[11px] text-slate-700 font-medium block mt-0.5">
                          Precipitation detected nearby. Consider covered or indoor seating.
                        </span>
                      </div>
                      <motion.span
                        className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-500 text-white shadow-sm flex-shrink-0"
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        {rainArrivalMins === 0 ? 'Active' : 'Imminent'}
                      </motion.span>
                    </motion.div>
                  )}

                  <LiveSkyCondition cloudcover={cloudcover} windGusts={windGusts} precipProbability={precipProbability} />

                  <VenueCardActions
                    verdict={verdict}
                    safeTags={safeTags}
                    safeVibes={safeVibes}
                    isRainStartingSoon={isRainStartingSoon}
                    minutesUntilRain={minutesUntilRain}
                    liveFeaturesForVenue={liveFeaturesForVenue}
                    heating={heating}
                    actualHappyHour={actualHappyHour}
                    isHotelOrStay={isHotelOrStay}
                    cozyWeatherActive={cozyWeatherActive}
                    setShowOwnerDashboard={setShowOwnerDashboard}
                    setSelectedVenue={setSelectedVenue}
                    venue={venue}
                  />
                </>
              )}

              {activeTab === 'Sun Forecast' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-4">
                  {localSunData && (
                    <div className="flex flex-col gap-3">
                      <h3 className="font-black text-slate-900 text-[15px]">Live 2D Solar Position</h3>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 font-bold">Altitude (Elevation Angle)</span>
                        <span className="font-black text-slate-900">{localSunData.altitude?.toFixed(1) ?? '–'}°</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 font-bold">Azimuth (Compass Angle)</span>
                        <span className="font-black text-slate-900">{localSunData.azimuth?.toFixed(1) ?? '–'}°</span>
                      </div>
                      {(() => {
                        const obstacleHeight = venue.obstacle_height ?? 2;
                        const obstacleDistance = venue.obstacle_distance ?? 1;
                        const isShaded = checkIfShaded(localSunData.altitude, obstacleHeight, obstacleDistance);
                        let statusText = '☀️ Direct Sun';
                        let statusClass = 'bg-amber-50 text-amber-500 border border-amber-100';

                        if (!localSunData.isSunUp) {
                          statusText = '🌙 Night (Sun is Down)';
                          statusClass = 'bg-slate-50 text-slate-500 border border-slate-200';
                        } else if (isShaded) {
                          statusText = '🏢 Shaded by Surroundings';
                          statusClass = 'bg-slate-50 text-slate-500 border border-slate-200';
                        } else if (contextIsRaining) {
                          statusText = '🌧️ Raining Currently';
                          statusClass = 'bg-slate-100 text-slate-600 border border-slate-200';
                        } else if (contextCloudCover > 75) {
                          statusText = '☁️ Overcast (Geometrically clear)';
                          statusClass = 'bg-slate-100 text-slate-600 border border-slate-200';
                        } else if (sunWindow) {
                          const timeStr = sunWindow.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                          statusText = `☀️ Direct Sun (Until ${timeStr})`;
                        }
                        return (
                          <div className={`mt-1 p-3 rounded-xl font-bold text-sm text-center ${statusClass}`}>
                            {statusText}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {(balconyData || (isHotelOrStay && outdoorSun.balcony > 0)) && (
                    <BalconySunshineBlock
                      balconyData={balconyData || { hours: outdoorSun.balcony, direction: null, views: null, type: 'balcony' }}
                      outdoorSun={outdoorSun}
                      isRainStartingSoon={isRainStartingSoon}
                      minutesUntilRain={minutesUntilRain}
                      cloudcover={cloudcover}
                    />
                  )}
                </div>
              )}

              {activeTab === 'Rooms' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-4">
                  {roomIntelligence && <RoomIntelligencePanel roomIntelligence={roomIntelligence} />}
                  {Array.isArray(venue?.roomTypes) && venue.roomTypes.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400 block px-1">
                        Room Solar Profiles
                      </span>
                      {venue.roomTypes.map((room, i) => (
                        <RoomSunCard key={room?.id ?? i} room={room} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'Happy Hour' && actualHappyHour && (
                <div
                  className="bg-white rounded-2xl border border-amber-200/80 shadow-sm p-5 flex flex-col gap-3.5"
                  style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">🍸</span>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 block">
                        Partner Deal · Happy Hour
                      </span>
                      <h4 className="text-base font-black text-slate-900 leading-tight">
                        {actualHappyHour.deal || 'Daily Drink Specials'}
                      </h4>
                    </div>
                  </div>

                  {actualHappyHour.start && actualHappyHour.end && (
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 bg-white/80 backdrop-blur-sm px-3.5 py-2.5 rounded-xl border border-amber-200">
                      <span>⏰ Hours</span>
                      <span className="text-amber-900 font-black">{actualHappyHour.start} – {actualHappyHour.end}</span>
                    </div>
                  )}

                  {Array.isArray(actualHappyHour.days) && actualHappyHour.days.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-slate-600">Available Days</span>
                      <div className="flex flex-wrap gap-1.5">
                        {actualHappyHour.days.map((day, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-black text-xs border border-amber-300"
                          >
                            {day}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'Amenities' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-4">
                  {weatherLoading ? (
                    <div className="h-32 animate-pulse bg-slate-200 rounded-xl w-full" />
                  ) : weatherUnavailable ? (
                    <WeatherUnavailableChip />
                  ) : !weather ? (
                    <div className="h-32 animate-pulse bg-slate-200 rounded-xl w-full" />
                  ) : (
                    <VenueCardWeather
                      score={score}
                      scoreLabel={scoreLabel}
                      scoreMeaningLabel={scoreMeaningLabel}
                      feelsLike={feelsLike}
                      wind={wind}
                      precipProb={precipProb}
                      minTemp={minTemp}
                      maxTemp={maxTemp}
                      uvIndex={uvIndex}
                      aqLabel={aqLabel}
                      hourlyData={hourlyData}
                      getWeatherDisplay={getWeatherDisplay}
                    />
                  )}

                    {shielding && (
                    <motion.div className="flex flex-col gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                      <span className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">Venue Shielding</span>
                      {shielding?.windbreak != null && <ShieldBar label="Windbreak" value={Math.min(1, Math.max(0, Number(shielding.windbreak)))} color="#0EA5E9" delay={0.1} />}
                      {shielding?.rainCover != null && <ShieldBar label="Rain Cover" value={Math.min(1, Math.max(0, Number(shielding.rainCover)))} color="#818CF8" delay={0.2} />}
                      {shielding?.shade     != null && <ShieldBar label="Shade"      value={Math.min(1, Math.max(0, Number(shielding.shade)))}    color="#F59E0B" delay={0.3} />}
                    </motion.div>
                    )}

                  {safeTags && safeTags.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
                      <span className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">Venue Features & Tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {safeTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

            {/* Sticky Bottom CTA — in-flow so it cannot bleed into the TopBar */}
            <div className="relative z-20 shrink-0 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <VenueCardFooterActions venue={safeVenue} canNavigate={hasValidCoordinates} />
            </div>
        </motion.article>
      </motion.div>
    </AnimatePresence>
  );
}

VenueCard.displayName = 'VenueCard';
export default memo(VenueCard);
