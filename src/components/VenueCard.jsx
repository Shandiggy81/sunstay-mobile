import React, { memo, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { X, Wind, Sun, Armchair, Flame, ExternalLink, Navigation, Share2, ChevronDown, Crosshair } from 'lucide-react';
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
import { useVenueMicroclimate, useMicroclimateState } from '../context/MicroclimateContext';
import { formatReadingTime } from '../utils/microclimate';
import { seedVenues } from '../data/seedVenues.js';
import { getVenueSunStatus, checkIfShaded, getSunWindow } from '../utils/solarMath.js';
import { calculateHourlyExposure } from '../utils/solarCalculator.js';
import { canUsePointerTilt } from '../utils/canUsePointerTilt';
import { resolveOverviewScore } from '../utils/resolveOverviewScore';


// ── Surface tokens ─────────────────────────────────────────
// Shared Tailwind strings so every panel in the sheet uses the same iOS-style
// elevation, hairline border and radius instead of drifting per block.
const CARD =
  'rounded-3xl border border-slate-900/[0.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.18)]';
// Caption2 (11px) is the smallest size iOS uses for labels; slate-600 keeps
// these micro-labels above 7:1 contrast on white.
const MICRO_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600';

// ── Live microclimate panel ────────────────────────────────
// Surfaces the three readings that come back from the venues_in_bbox RPC:
// sun_now (resolved against the venue's hourly curve at the slider time),
// effective_wind and comfort_hint. Rendered only when the venue actually has
// a profile row, so venues outside the seeded set are unchanged.
const MicroclimatePanel = memo(function MicroclimatePanel({ reading, atLabel }) {
  if (!reading?.available) return null;

  const pct = reading.sunFraction == null ? 0 : Math.round(reading.sunFraction * 100);
  const isEstimate = reading.confidence != null && reading.confidence < 0.5;

  return (
    <div className="my-1 rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-50 to-white p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={MICRO_LABEL}>Microclimate at {atLabel}</span>
        {reading.isLiveSun ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
            Live
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em] text-slate-900">
          {reading.sunPercent}
        </span>
        {reading.sunLabel ? (
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-700">
            {reading.sunLabel}
          </span>
        ) : null}
      </div>

      {/* Same 0–100 scale as the number above, so the bar is a redundant
          encoding rather than a second thing to interpret. */}
      <div
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-900/[0.08]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sun availability at ${atLabel}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {(reading.windLabel || reading.comfortHint) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {reading.windLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-[12px] font-semibold text-sky-700">
              <Wind size={12} aria-hidden="true" />
              {reading.windLabel}
            </span>
          ) : null}
          {reading.comfortHint ? (
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-600">
              {reading.comfortHint}
            </span>
          ) : null}
        </div>
      )}

      {isEstimate ? (
        <p className="mt-2.5 text-[11px] font-medium leading-snug text-slate-500">
          Modelled from street geometry, not measured on site.
        </p>
      ) : null}
    </div>
  );
});

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

const tabSlug = (tab) => String(tab).toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
    <div className={`${CARD} p-4`}>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{sky.emoji} {sky.label}</span>
      {windGusts > 0 && (
        <p className="mt-1.5 text-[13px] font-medium text-slate-600">Wind gusts peaking at {Math.round(windGusts)} km/h</p>
      )}
    </div>
  );
};

const ShieldBar = ({ label, value, color, delay = 0 }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between">
      <span className={MICRO_LABEL}>{label}</span>
      <span className="text-[11px] font-bold tabular-nums text-slate-700">{Math.round(value * 100)}%</span>
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
      className={`${CARD} flex flex-col gap-3 p-4`}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 24 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.span className="text-xl" animate={isSunNow ? { scale: [1, 1.2, 0.95, 1.15, 1], rotate: [-4, 4, -3, 3, 0] } : {}} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
            {isSunNow ? '☀️' : '🪟'}
          </motion.span>
          <div className="min-w-0">
            <span className={`block ${isSunNow ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700' : MICRO_LABEL}`}>
              {balconyData.type === 'pool' ? 'Pool & Outdoor Area' : 'Balcony'}
            </span>
            <span className="block text-[17px] font-bold leading-snug tracking-[-0.01em] text-slate-900 tabular-nums">{sunHoursNum}h Sun Today</span>
          </div>
        </div>
        {isSunNow && (
          <motion.span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>Sun now</motion.span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-[13px] text-slate-600">
        {balconyData.direction && <span className="font-semibold">📍 {balconyData.direction} facing</span>}
        {balconyData.views && <span className="truncate font-medium">{balconyData.views}</span>}
      </div>
      {rainSoon && (
        <motion.div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.22)' }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>🌧️</motion.span>
          <span className="text-[13px] font-semibold" style={{ color: '#0369A1' }}>
            {minutesUntilRain === 0 ? 'Rain falling now — head inside' : `Rain approaching in ${minutesUntilRain} mins — grab a spot now`}
          </span>
        </motion.div>
      )}
      {!rainSoon && cloudSoon && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.20)' }}>
          <span>⛅</span>
          <span className="text-[13px] font-semibold text-slate-600">Clouds building — {cloudPct}% cover right now</span>
        </div>
      )}
      {isSunNow && !rainSoon && !cloudSoon && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
          <span>✨</span>
          <span className="text-[13px] font-semibold" style={{ color: '#92400E' }}>Direct sunshine on the {balconyData.type === 'pool' ? 'pool deck' : 'balcony'} right now</span>
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
    <motion.div className={`${CARD} p-4`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-700">🛎 Room Intelligence</span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true">{item.icon}</span>
            <span className="truncate text-[13px] font-semibold text-slate-700">{item.label}</span>
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
      className="mt-1 rounded-3xl border border-amber-500/20 bg-amber-50/60 p-4"
      aria-labelledby="solar-exposure-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="solar-exposure-heading" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
          Direct Sun · 8 AM–8 PM
        </h3>
        <span className="shrink-0 rounded-full border border-amber-500/20 bg-white px-2.5 py-1 text-[11px] font-bold tabular-nums text-amber-800">
          ☀️ {directHours} hrs today
        </span>
      </div>

      {/* Each hour is a full 44px-tall hit area with a slim visual bar inside,
          so the tap target meets the iOS minimum without thickening the chart. */}
      <div className="mt-2 flex items-center gap-1" role="list" aria-label="Hourly direct sun exposure">
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
              className="group flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label={`${hour.label}: ${hour.hasDirectSun ? 'Direct Sun' : 'Shaded'}`}
              aria-pressed={isActive}
            >
              <span
                aria-hidden="true"
                className={`w-full rounded-full transition-all duration-200 ease-out ${
                  hour.hasDirectSun ? 'bg-amber-400' : 'bg-slate-300'
                } ${isActive ? 'h-4 ring-2 ring-amber-500/35' : 'h-2.5 group-hover:h-3.5'}`}
              />
            </button>
          );
        })}
      </div>

      <div className="flex justify-between px-0.5 text-[11px] font-semibold tabular-nums text-slate-600" aria-hidden="true">
        <span>8 AM</span>
        <span>12 PM</span>
        <span>4 PM</span>
        <span>8 PM</span>
      </div>

      <p className="mt-2.5 min-h-[20px] text-[13px] font-medium leading-snug text-slate-700" aria-live="polite">
        {activeHour ? statusLabel : 'Tap an hour for its direct sun status'}
      </p>
    </section>
  );
});
SolarExposureTimeline.displayName = 'SolarExposureTimeline';

// ── Sunstay Score Hero Badge ────────────────────────────────────
// Every score state (loading, unavailable, resolved) reserves the same height so
// the sheet never reflows when the weather request settles.
const SCORE_SHELL = `${CARD} min-h-[102px] w-full px-5 py-4`;

const WeatherUnavailableChip = ({ label = 'Weather temporarily unavailable' }) => (
  <div className={`${SCORE_SHELL} flex items-center`}>
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-900/[0.08] bg-slate-100 px-3.5 py-1.5 text-[13px] font-semibold text-slate-700">
      {label}
    </span>
  </div>
);

const SunstayScoreSkeleton = () => (
  <div className={SCORE_SHELL} aria-hidden="true">
    <div className="flex items-center gap-4">
      <div className="h-[68px] w-[68px] animate-pulse rounded-full bg-slate-200" />
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
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
      className={`${SCORE_SHELL} flex items-center gap-4`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.08 }}
    >
      {/* Circular score ring */}
      <div className="relative flex h-[68px] w-[68px] flex-shrink-0 items-center justify-center">
        <svg width="68" height="68" viewBox="0 0 68 68" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx="34" cy="34" r="29" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="6" />
          <motion.circle
            cx="34" cy="34" r="29" fill="none"
            stroke={fill} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 29}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 29 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 29 * (1 - pct / 100) }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[20px] font-bold leading-none tabular-nums tracking-[-0.02em]" style={{ color: text }}>{pct}</span>
        </div>
      </div>

      {/* Labels */}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: text }}>Sunstay Score</span>
          <span className="text-base leading-none" aria-hidden="true">{emoji}</span>
        </div>
        <span className="text-[19px] font-bold leading-snug tracking-[-0.015em] text-slate-900">{label}</span>
        {showWindow && (
          <motion.span
            className="text-[13px] font-semibold leading-snug"
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
            className="text-[13px] font-semibold leading-snug"
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
const DetailedForecastAccordion = ({ lat, lng, venue, uvIndex, aqLabel, wind, children, onOpen }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const forecastHeaderRef = useRef(null);
  const panelId = `venue-forecast-details-${venue?.id ?? 'panel'}`;

  const handleToggleForecast = () => {
    const isOpening = !isExpanded;
    setIsExpanded(isOpening);
    if (isOpening) {
      onOpen?.();
      setTimeout(() => {
        const header = forecastHeaderRef.current;
        if (!header) return;
        // Scroll the sheet overlay only — never the window or the drag-transformed article.
        const scroller = header.closest('[data-venue-card-scroller]');
        if (scroller) {
          const offset =
            header.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop -
            8;
          scroller.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
        } else {
          header.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150); // wait for CSS grid expansion
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-1 w-full">
      <div
        ref={forecastHeaderRef}
        className={`flex w-full select-none items-center justify-between gap-3 rounded-3xl border px-4 py-3 transition-colors duration-200 ${
          isExpanded
            ? 'border-sky-500/25 bg-sky-500/[0.09]'
            : 'border-slate-900/[0.06] bg-slate-900/[0.03]'
        }`}
        style={{ scrollMarginTop: 8 }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-base" aria-hidden="true">
            📊
          </span>
          <div className="min-w-0">
            <span className="block text-[15px] font-semibold leading-snug tracking-[-0.01em] text-slate-900">
              Detailed Forecast & Intelligence
            </span>
            <span className="mt-0.5 block text-[13px] font-medium text-slate-600">
              {isExpanded ? 'Tap the arrow to hide forecast' : 'Tap the arrow for detailed forecast'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleForecast}
          onPointerDown={e => e.stopPropagation()}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          aria-label={isExpanded ? 'Hide detailed forecast' : 'Show detailed forecast'}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-sky-600 text-white shadow-[0_2px_8px_rgba(2,132,199,0.35)] transition-transform duration-150 ease-out active:scale-[0.96] active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
        >
          <ChevronDown
            size={20}
            strokeWidth={2.25}
            className={`transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
          />
        </button>
      </div>

      <div
        id={panelId}
        aria-hidden={!isExpanded}
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-[grid-template-rows] ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden" inert={isExpanded ? undefined : true}>
          <div className="flex flex-col gap-3 pt-1 pb-1">
            {/* Secondary Metrics (UV, Wind, & Pristine Air) */}
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
              <div className={`${CARD} flex min-h-[64px] min-w-[144px] shrink-0 items-center gap-3 p-3`}>
                <span className="flex-shrink-0 text-xl" aria-hidden="true">🔆</span>
                <div className="min-w-0">
                  <span className={`block ${MICRO_LABEL}`}>UV Index</span>
                  <span className="mt-0.5 block text-[17px] font-bold tabular-nums tracking-[-0.01em] text-slate-900">{uvIndex ?? '–'}</span>
                </div>
              </div>
              <div className={`${CARD} flex min-h-[64px] min-w-[144px] shrink-0 items-center gap-3 p-3`}>
                <span className="flex-shrink-0 text-xl" aria-hidden="true">🌬️</span>
                <div className="min-w-0">
                  <span className={`block ${MICRO_LABEL}`}>Wind</span>
                  <span className="mt-0.5 block text-[17px] font-bold tabular-nums tracking-[-0.01em] text-slate-900">{wind !== undefined ? `${Math.round(wind)} km/h` : '–'}</span>
                </div>
              </div>
              <div className={`${CARD} flex min-h-[64px] min-w-[144px] shrink-0 items-center gap-3 p-3`}>
                <span className="flex-shrink-0 text-xl" aria-hidden="true">🌿</span>
                <div className="min-w-0">
                  <span className={`block ${MICRO_LABEL}`}>Air Quality</span>
                  <span className="mt-0.5 block truncate text-[17px] font-bold tracking-[-0.01em] text-slate-900">{aqLabel ?? '–'}</span>
                </div>
              </div>
            </div>

            {/* Hourly Comfort Forecast */}
            {lat && lng && (
              <div className="overflow-hidden rounded-3xl border border-sky-500/15 bg-sky-500/[0.04]">
                <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
                  <span className={MICRO_LABEL}>Hourly Comfort Forecast</span>
                </div>
                <HourlyForecastStrip lat={lat} lng={lng} dark enabled={isExpanded} />
              </div>
            )}

            {/* Wind & Comfort Intelligence */}
            <WindComfortPanel venue={venue} />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

function resolveVenueWebsiteUrl(venue) {
  const raw = venue?.official_website_url || venue?.website_url || venue?.website || venue?.url;
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return url || null;
}

// iOS toolbar buttons: 50px tall capsules, primary action given more width than
// the two secondary actions so the hierarchy reads at a glance.
const footerActionClass =
  'flex items-center justify-center gap-1.5 min-h-[50px] px-2.5 rounded-2xl text-[13px] font-semibold leading-tight tracking-[-0.01em] text-center transition-transform duration-150 active:scale-[0.97]';
const footerSecondaryClass =
  `${footerActionClass} flex-1 bg-white text-slate-800 border border-slate-900/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.05)]`;
const footerPrimaryClass =
  `${footerActionClass} flex-[1.5] bg-amber-500 text-slate-950 shadow-[0_2px_10px_rgba(245,158,11,0.35)]`;

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
    <div className="flex flex-row gap-2.5">
      {websiteUrl ? (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={footerSecondaryClass}
        >
          <ExternalLink size={15} aria-hidden="true" />
          Website
        </a>
      ) : (
        <span
          className={`${footerSecondaryClass} pointer-events-none opacity-40`}
          aria-disabled="true"
        >
          <ExternalLink size={15} aria-hidden="true" />
          Website
        </span>
      )}

      {directionsUrl ? (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={footerPrimaryClass}
          aria-label="Get Directions"
        >
          <Navigation size={15} aria-hidden="true" />
          Get Directions
        </a>
      ) : (
        <button
          type="button"
          disabled
          className={`${footerPrimaryClass} cursor-not-allowed opacity-40`}
          aria-label="Get Directions unavailable"
        >
          <Navigation size={15} aria-hidden="true" />
          Get Directions
        </button>
      )}

      <button
        type="button"
        onClick={handleShare}
        disabled={!websiteUrl}
        className={`${footerSecondaryClass} disabled:pointer-events-none disabled:opacity-40`}
        aria-label={shareLabel === 'Copied!' ? 'Copied!' : 'Share venue'}
      >
        <Share2 size={15} aria-hidden="true" />
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
  const [forecastOpen, setForecastOpen] = useState(false);

  React.useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
    setForecastOpen(false);
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

  // Server-side microclimate for this venue, read at the time-of-day slider's
  // position. Empty until the viewport fetch lands, and empty for venues with
  // no profile row, in which case the panel below does not render.
  const microclimate = useVenueMicroclimate(venue?.id);
  const { todMinutes } = useMicroclimateState();
  const microclimateAtLabel = useMemo(() => formatReadingTime(todMinutes), [todMinutes]);

  const dragControls = useDragControls();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-4, 4]), { stiffness: 200, damping: 25 });
  const cardRectRef = useRef(null);
  const enableTilt = useMemo(() => canUsePointerTilt(), []);

  // Pull live cozy-index + best window from Open-Meteo-backed context.
  // getSunstayScoreResult already includes settled TOD previewMinutes.
  const {
    weather: weatherData,
    loading: weatherLoading,
    error: weatherError,
    unavailable: weatherUnavailableFlag,
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

  function handlePointerEnter(e) {
    if (!enableTilt) return;
    cardRectRef.current = e.currentTarget.getBoundingClientRect();
  }
  function handlePointerMove(e) {
    if (!enableTilt) return;
    const rect = cardRectRef.current;
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function handlePointerLeave() {
    if (!enableTilt) return;
    cardRectRef.current = null;
    mouseX.set(0);
    mouseY.set(0);
  }

  const safeVenue = venue || {};
  const { name, type, suburb, lat, lng, balconyData, heating, vibe = [], tags = [] } = safeVenue;
  // shielding is a JSONB column — Supabase may return null instead of {} after migration
  const shielding = safeVenue.shielding && typeof safeVenue.shielding === 'object' ? safeVenue.shielding : null;
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeVibes = Array.isArray(vibe) ? vibe : (vibe ? [vibe] : []);
  const fallbackName = venue?.venueName ?? venue?.name ?? venue?.title ?? 'Unnamed venue';
  const displayName = fallbackName;
  // `vibe` is null on ~19% of Supabase rows and `suburb` can be blank, so the
  // subtitle is assembled from present parts only — never "· CBD" or "Pub ·".
  const subtitleText = useMemo(() => {
    const vibeText = safeVibes
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
      .join(', ');
    const suburbText = String(suburb ?? '').trim();
    return [vibeText, suburbText].filter(Boolean).join(' · ');
  }, [safeVibes, suburb]);
  const isHotelOrStay = checkIsAccommodation(venue);
  const venueImage = venue?.image_url ?? venue?.imageUrl ?? venue?.image ?? venue?.hero_image ?? venue?.photoUrl ?? venue?.photo;
  const showVenueImage = Boolean(venueImage) && !imageError;
  const showHeroSkeleton = weatherLoading || (showVenueImage && !imageLoaded);

  const hourlyData = weather?.rawWeather?.hourly ?? (weather?.rawWeather?.time ? weather.rawWeather : null) ?? null;
  const temp       = weather?.rawWeather?.temp ?? weather?.main?.temp ?? weather?.temp ?? 22;
  const wind       = weather?.rawWeather?.wind ?? weather?.wind?.speed ?? 0;
  const overviewScore = resolveOverviewScore({
    loading: weatherLoading,
    getSunstayScoreResult,
    venue,
  });
  const score = overviewScore.score;
  const uvIndex    = weather?.rawWeather?.uvIndex ?? venue?.weatherNow?.uvIndex ?? 3;
  const precipProb = weather?.rawWeather?.precipProb ?? venue?.weatherNow?.precipProb ?? 0;
  const feelsLike  = weather?.rawWeather?.feelsLike ?? temp;
  const { weatherCode } = weather || {};
  const { aqLabel } = useOpenAQ(lat, lng, { enabled: forecastOpen });
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
  useOpenUV(lat, lng, { enabled: forecastOpen });
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
  const { isRainStartingSoon, minutesUntilRain, rainArrivalMins, rainArrivalLabel } = useTomorrowRain(lat, lng, { enabled: forecastOpen });

  const sunData = useMemo(() => (lat && lng) ? getSunData(lat, lng) : null, [lat, lng]);
  const outdoorSun = useMemo(() => isHotelOrStay ? calcOutdoorSun(venue, hourlyData) : { balcony: 0, pool: 0 }, [venue, hourlyData, isHotelOrStay]);
  const sunHours = useMemo(() => {
    if (isHotelOrStay && (outdoorSun.balcony > 0 || outdoorSun.pool > 0))
      return { outdoor: `${outdoorSun.balcony}h`, covered: `${outdoorSun.pool}h`, labels: { outdoor: 'Balcony', covered: 'Pool' } };
    const sunHoursFallback = getDeterministicSunHours(venue?.id);
    return { outdoor: `${sunHoursFallback}h`, covered: `${Math.max(4, sunHoursFallback - 2)}h`, labels: { outdoor: 'Outdoor', covered: 'Covered' } };
  }, [isHotelOrStay, outdoorSun, venue?.id]);
  const directSunHours = Number.parseFloat(sunHours.outdoor) || 0;
  const hasSunHours = Number.isFinite(directSunHours) && directSunHours > 0;
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
    if (overviewScore.loading) return null;
    if (overviewScore.unavailable || !Number.isFinite(score)) return overviewScore.label || 'Score unavailable';
    if (overviewScore.label) return overviewScore.label;
    if (score > 75) return 'Perfect Now';
    if (score >= 50) return 'Good Choice';
    return 'Worth a Look';
  }, [score, overviewScore]);
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
        className="absolute inset-0 z-[110] flex flex-col overflow-hidden bg-slate-950/40 backdrop-blur-md"
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
            ...(enableTilt ? { rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1200 } : null),
            boxShadow: '0 -20px 60px -12px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
          className="pointer-events-auto relative z-50 flex h-full min-h-0 w-full select-none flex-col overflow-hidden rounded-t-[28px] border-t border-white/60 bg-white/90 backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
          onPointerEnter={enableTilt ? handlePointerEnter : undefined}
          onPointerMove={enableTilt ? handlePointerMove : undefined}
          onPointerLeave={enableTilt ? handlePointerLeave : undefined}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: '28px 28px 0 0', zIndex: 0 }}>
            <motion.div animate={{ scale: [1, 1.18, 1], x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${blobA} 0%, transparent 65%)`, filter: 'blur(48px)' }} />
            <motion.div animate={{ scale: [1, 1.12, 1], x: [0, -30, 0], y: [0, 20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }} style={{ position: 'absolute', bottom: '15%', left: -60, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${blobB} 0%, transparent 65%)`, filter: 'blur(56px)' }} />
          </div>

          <div className="relative z-20 isolate shrink-0 overflow-hidden border-b border-slate-900/[0.06] bg-white px-4 [transform-style:flat]">
            {/* 1. Extracted Drag Handle for top of sheet — 36x5 iOS grabber with a
                   44px-tall drag surface so the gesture is easy to land. */}
            <div
              className="flex h-11 w-full items-center justify-center lg:hidden"
              onPointerDown={e => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="h-[5px] w-9 rounded-full bg-slate-900/20" />
            </div>

            {/* 2. Sticky title chrome — Title, Subtitle, Close */}
            <div className="sticky top-0 z-20 flex items-start justify-between gap-3 bg-white pb-3 pt-1 lg:pt-4">
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 break-words text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-slate-900">
                  {fallbackName}
                </h2>
                {subtitleText ? (
                  <p className="mt-1 line-clamp-1 text-[15px] font-medium text-slate-600">{subtitleText}</p>
                ) : null}
              </div>
              <motion.button
                onClick={onClose}
                className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-900/[0.06] text-slate-700 ring-1 ring-inset ring-slate-900/[0.06] transition-colors active:bg-slate-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                whileTap={{ scale: 0.92 }}
                aria-label="Close venue details"
              >
                <X size={19} strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>

          <div
            data-venue-card-scroller
            className="relative z-10 isolate min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 flex flex-col gap-2 bg-white [transform-style:flat]"
          >
            {/* Hero image */}
            <div className="relative mb-1 w-full aspect-video min-h-[12rem] sm:min-h-[14rem] shrink-0 overflow-hidden rounded-3xl bg-slate-200 ring-1 ring-inset ring-slate-900/10">
              {/* Background image / gradient layer */}
              <div className="absolute inset-0 z-0">
                {showVenueImage ? (
                  <img
                    src={venueImage}
                    alt={fallbackName}
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
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
                    <span className="relative z-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200 drop-shadow-sm">
                      SunStay Melbourne
                    </span>
                    <span className="relative z-10 mt-0.5 text-[13px] font-medium text-slate-200">
                      {safeVenue?.suburb || 'Solar Intelligence'}
                    </span>
                  </div>
                ) : null}
                {showHeroSkeleton && (
                  <div className="absolute inset-0 z-[1] animate-pulse bg-slate-200" aria-hidden="true" />
                )}
              </div>

              {/* Scrim + headline sun metrics, so the hero carries the signature
                  numbers instead of repeating them in a card underneath. */}
              {!showHeroSkeleton && (hasSunHours || peakSunWindow) ? (
                <>
                  <div
                    className="absolute inset-x-0 bottom-0 z-[2] h-2/3 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent"
                    aria-hidden="true"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-[3] flex flex-wrap items-center gap-2 p-3">
                    {hasSunHours ? (
                      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-slate-950/45 px-3 py-1 text-[13px] font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur-md">
                        <span aria-hidden="true">☀️</span>
                        <span className="tabular-nums">{directSunHours.toFixed(1)}h</span> direct sun
                      </span>
                    ) : null}
                    {peakSunWindow ? (
                      <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-slate-950/45 px-3 py-1 text-[13px] font-semibold tabular-nums text-white ring-1 ring-inset ring-white/25 backdrop-blur-md">
                        Peak {peakSunWindow}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            {/* Map Centre Action & Signal Line */}
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3 px-1">
              <div className="flex min-w-0 items-center gap-2 text-slate-900">
                <span className="text-xl" aria-hidden="true">{verdict.icon}</span>
                <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{verdict.text}</span>
              </div>
              {onCenter && (
                <button
                  type="button"
                  onClick={() => onCenter(venue)}
                  className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-800 transition-colors active:bg-sky-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                  aria-label="Centre on map"
                  title="Centre on map"
                >
                  <Crosshair size={18} strokeWidth={2.25} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Tabbed Navigation (Dynamically Pruned) — iOS segmented control.
                Up to three sections share the width evenly like a static segmented
                control; beyond that the track scrolls horizontally (Apple Maps /
                Airbnb style) so long labels such as "Sun Forecast" never clip. */}
            <div
              role="tablist"
              aria-label="Venue detail sections"
              className="mb-4 flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain rounded-2xl bg-slate-900/[0.05] p-1 scrollbar-hide"
            >
              {availableTabs.map(tab => {
                const isActiveTab = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`venue-tab-${tabSlug(tab)}`}
                    aria-selected={isActiveTab}
                    aria-controls={`venue-tabpanel-${tabSlug(tab)}`}
                    onClick={() => setActiveTab(tab)}
                    className={`min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-xl px-3.5 text-[14px] font-semibold tracking-[-0.01em] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      availableTabs.length <= 3 ? 'flex-1' : 'flex-none'
                    } ${
                      isActiveTab
                        ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.04]'
                        : 'text-slate-600 active:bg-white/50'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div
              role="tabpanel"
              id={`venue-tabpanel-${tabSlug(activeTab)}`}
              aria-labelledby={`venue-tab-${tabSlug(activeTab)}`}
              className="flex flex-col gap-4 pb-4"
            >
              {activeTab === 'Overview' && (
                <>
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
                      <div className={`${CARD} flex min-h-[56px] items-center p-3.5`}>
                        <span
                          className="inline-flex min-h-8 items-center gap-2 rounded-full border bg-slate-900/[0.03] px-3 py-1.5"
                          style={{ borderColor: `${quote.riskColor}44` }}
                        >
                          <span
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: quote.riskColor }}
                          />
                          <span className="text-[13px] font-semibold tracking-[0.01em]" style={{ color: quote.riskColor }}>
                            {quote.riskBand} Rain Risk
                          </span>
                          <span className="text-[13px] font-medium text-slate-600">· Guarantee available</span>
                        </span>
                      </div>
                    );
                  })()}

                  {weatherLoading ? (
                    <SunstayScoreSkeleton />
                  ) : (
                    <SunstayScoreBadge
                      score={score}
                      bestWindow={weatherUnavailable || overviewScore.unavailable ? null : bestWindow}
                      scoreLabel={scoreLabel}
                      unavailable={overviewScore.unavailable || !Number.isFinite(score)}
                    />
                  )}

                  <DetailedForecastAccordion
                    lat={lat}
                    lng={lng}
                    venue={venue}
                    uvIndex={uvIndex}
                    aqLabel={aqLabel}
                    wind={wind}
                    onOpen={() => setForecastOpen(true)}
                  />

                  <MicroclimatePanel reading={microclimate} atLabel={microclimateAtLabel} />

                  {/* Microclimate Grid — fixed cell height + truncation keeps the
                      grid stable whether a field resolves, falls back, or is long. */}
                  <div className="my-1 grid grid-cols-2 gap-2.5">
                    <div className="flex min-h-[92px] flex-col justify-between rounded-2xl border border-slate-900/[0.06] bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className={MICRO_LABEL}>Wind &amp; Shelter</span>
                        <Wind size={15} className="shrink-0 text-sky-600" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-slate-900">{windSpeedDisplay}</span>
                        <span className="block truncate text-[13px] font-medium text-slate-600">{windShelter}</span>
                      </div>
                    </div>

                    <div className="flex min-h-[92px] flex-col justify-between rounded-2xl border border-slate-900/[0.06] bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className={MICRO_LABEL}>UV &amp; Solar</span>
                        <Sun size={15} className="shrink-0 text-amber-500" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-slate-900">UV {uvValue}</span>
                        <span className="block truncate text-[13px] font-medium text-slate-600">{uvGuideline}</span>
                      </div>
                    </div>

                    <div className="flex min-h-[92px] flex-col justify-between rounded-2xl border border-slate-900/[0.06] bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className={MICRO_LABEL}>Seating</span>
                        <Armchair size={15} className="shrink-0 text-slate-600" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{seatingLayout}</span>
                        <span className="block truncate text-[13px] font-medium text-slate-600">
                          {hasCoveredSeating ? 'Covered' : 'Open Air'}
                        </span>
                      </div>
                    </div>

                    <div className="flex min-h-[92px] flex-col justify-between rounded-2xl border border-slate-900/[0.06] bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className={MICRO_LABEL}>Heating</span>
                        <Flame size={15} className="shrink-0 text-orange-500" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{heatingLabel}</span>
                        <span className="block truncate text-[13px] font-medium text-slate-600">{outdoorComfort}</span>
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
                      <div className="flex flex-shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xl" aria-hidden="true">
                        🛰️
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                          Predictive Radar Alert
                        </span>
                        <p className="mt-0.5 text-[15px] font-bold leading-snug tracking-[-0.01em] text-slate-900">
                          {rainArrivalLabel}
                        </p>
                        <span className="mt-0.5 block text-[13px] font-medium leading-snug text-slate-700">
                          Precipitation detected nearby. Consider covered or indoor seating.
                        </span>
                      </div>
                      <motion.span
                        className="flex-shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-sm"
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
                <div className={`${CARD} flex flex-col gap-4 p-4`}>
                  {localSunData && (
                    <div className="flex flex-col gap-3">
                      <h3 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">Live 2D Solar Position</h3>
                      <div className="flex items-center justify-between gap-3 text-[15px]">
                        <span className="font-medium text-slate-600">Altitude (Elevation Angle)</span>
                        <span className="font-semibold tabular-nums text-slate-900">{localSunData.altitude?.toFixed(1) ?? '–'}°</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[15px]">
                        <span className="font-medium text-slate-600">Azimuth (Compass Angle)</span>
                        <span className="font-semibold tabular-nums text-slate-900">{localSunData.azimuth?.toFixed(1) ?? '–'}°</span>
                      </div>
                      {(() => {
                        const obstacleHeight = venue.obstacle_height ?? 2;
                        const obstacleDistance = venue.obstacle_distance ?? 1;
                        const isShaded = checkIfShaded(localSunData.altitude, obstacleHeight, obstacleDistance);
                        let statusText = '☀️ Direct Sun';
                        let statusClass = 'bg-amber-50 text-amber-800 border border-amber-500/20';

                        if (!localSunData.isSunUp) {
                          statusText = '🌙 Night (Sun is Down)';
                          statusClass = 'bg-slate-50 text-slate-700 border border-slate-900/[0.08]';
                        } else if (isShaded) {
                          statusText = '🏢 Shaded by Surroundings';
                          statusClass = 'bg-slate-50 text-slate-700 border border-slate-900/[0.08]';
                        } else if (contextIsRaining) {
                          statusText = '🌧️ Raining Currently';
                          statusClass = 'bg-slate-100 text-slate-700 border border-slate-900/[0.08]';
                        } else if (contextCloudCover > 75) {
                          statusText = '☁️ Overcast (Geometrically clear)';
                          statusClass = 'bg-slate-100 text-slate-700 border border-slate-900/[0.08]';
                        } else if (sunWindow) {
                          const timeStr = sunWindow.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                          statusText = `☀️ Direct Sun (Until ${timeStr})`;
                        }
                        return (
                          <div className={`mt-1 flex min-h-11 items-center justify-center rounded-2xl px-3 text-center text-[15px] font-semibold ${statusClass}`}>
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
                <div className={`${CARD} flex flex-col gap-4 p-4`}>
                  {roomIntelligence && <RoomIntelligencePanel roomIntelligence={roomIntelligence} />}
                  {Array.isArray(venue?.roomTypes) && venue.roomTypes.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <span className={`block px-1 ${MICRO_LABEL}`}>
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
                  className="flex flex-col gap-3.5 rounded-3xl border border-amber-500/20 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.18)]"
                  style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-2xl" aria-hidden="true">🍸</span>
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                        Partner Deal · Happy Hour
                      </span>
                      <h4 className="text-[17px] font-bold leading-snug tracking-[-0.01em] text-slate-900">
                        {actualHappyHour.deal || 'Daily Drink Specials'}
                      </h4>
                    </div>
                  </div>

                  {actualHappyHour.start && actualHappyHour.end && (
                    <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-white/80 px-3.5 text-[15px] font-medium text-slate-700 backdrop-blur-sm">
                      <span>⏰ Hours</span>
                      <span className="font-semibold tabular-nums text-amber-900">{actualHappyHour.start} – {actualHappyHour.end}</span>
                    </div>
                  )}

                  {Array.isArray(actualHappyHour.days) && actualHappyHour.days.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className={MICRO_LABEL}>Available Days</span>
                      <div className="flex flex-wrap gap-1.5">
                        {actualHappyHour.days.map((day, idx) => (
                          <span
                            key={idx}
                            className="rounded-lg border border-amber-500/25 bg-amber-100 px-2.5 py-1 text-[13px] font-semibold text-amber-900"
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
                <div className={`${CARD} flex flex-col gap-4 p-4`}>
                  {weatherLoading ? (
                    <div className="h-32 w-full animate-pulse rounded-2xl bg-slate-200" />
                  ) : weatherUnavailable ? (
                    <WeatherUnavailableChip />
                  ) : !weather ? (
                    <div className="h-32 w-full animate-pulse rounded-2xl bg-slate-200" />
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
                    <motion.div className="flex flex-col gap-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                      <span className={MICRO_LABEL}>Venue Shielding</span>
                      {shielding?.windbreak != null && <ShieldBar label="Windbreak" value={Math.min(1, Math.max(0, Number(shielding.windbreak)))} color="#0EA5E9" delay={0.1} />}
                      {shielding?.rainCover != null && <ShieldBar label="Rain Cover" value={Math.min(1, Math.max(0, Number(shielding.rainCover)))} color="#818CF8" delay={0.2} />}
                      {shielding?.shade     != null && <ShieldBar label="Shade"      value={Math.min(1, Math.max(0, Number(shielding.shade)))}    color="#F59E0B" delay={0.3} />}
                    </motion.div>
                    )}

                  {safeTags && safeTags.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-slate-900/[0.06] pt-3">
                      <span className={MICRO_LABEL}>Venue Features &amp; Tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {safeTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="rounded-lg border border-slate-900/[0.08] bg-slate-100 px-2.5 py-1 text-[13px] font-semibold text-slate-700"
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
            <div className="relative z-20 shrink-0 border-t border-slate-900/[0.08] bg-white/85 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl backdrop-saturate-150">
              <VenueCardFooterActions venue={safeVenue} canNavigate={hasValidCoordinates} />
            </div>
        </motion.article>
      </motion.div>
    </AnimatePresence>
  );
}

VenueCard.displayName = 'VenueCard';
export default memo(VenueCard);
