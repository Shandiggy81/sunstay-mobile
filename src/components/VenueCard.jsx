import React, { memo, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { getSunPositionForMap } from '../utils/sunPosition';
import { venues } from '../data/venues';
import WeatherWidget from './WeatherWidget';
import HourlyForecastStrip from './HourlyForecastStrip';
import LiveSunTimeline from './LiveSunTimeline';
import { getSunData } from '../utils/getSunData';
import { useOpenAQ } from '../hooks/useOpenAQ';
import { useTomorrowRain } from '../hooks/useTomorrowRain';
import { useOpenUV } from '../hooks/useOpenUV';
import VenueCardHeader from './VenueCardHeader';
import VenueCardWeather from './VenueCardWeather';
import VenueCardSun from './VenueCardSun';
import VenueCardActions from './VenueCardActions';
import WindComfortPanel from './WindComfortPanel';
import { useWeather } from '../context/WeatherContext';

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
    <div style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.14)', borderRadius: '16px', padding: '14px 16px' }}>
      <span style={{ color: '#1E293B', fontSize: '15px', fontWeight: 700 }}>{sky.emoji} {sky.label}</span>
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
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: isSunNow ? 'rgba(245,158,11,0.08)' : 'rgba(14,165,233,0.05)', border: `1px solid ${isSunNow ? 'rgba(245,158,11,0.30)' : 'rgba(14,165,233,0.14)'}`, boxShadow: isSunNow ? '0 0 24px rgba(245,158,11,0.12)' : 'none' }}
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
    <motion.div className="rounded-2xl p-3" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.18)' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
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

// ── Sunstay Score Badge ────────────────────────────────────
const SunstayScoreBadge = ({ score, bestWindow }) => {
  const pct = Math.round(Math.max(0, Math.min(100, score)));

  // Colour ramp: cold/poor → blue, mid → amber, high → emerald
  const { bg, border, text, fill } = pct >= 75
    ? { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.28)', text: '#065F46', fill: '#10B981' }
    : pct >= 50
    ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', text: '#92400E', fill: '#F59E0B' }
    : { bg: 'rgba(14,165,233,0.07)', border: 'rgba(14,165,233,0.22)', text: '#0C4A6E', fill: '#0EA5E9' };

  const emoji = pct >= 75 ? '☀️' : pct >= 50 ? '🌤️' : '🌥️';
  const label = pct >= 75 ? 'Peak Comfort' : pct >= 50 ? 'Good Conditions' : 'Worth a Look';

  // Best window line (only show if there is a meaningful future window)
  const showWindow = bestWindow?.type === 'FUTURE_WINDOW' && bestWindow.startsInHours > 0;

  return (
    <motion.div
      className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: bg, border: `1px solid ${border}` }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.08 }}
    >
      {/* Circular score ring */}
      <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
        <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="4" />
          <motion.circle
            cx="26" cy="26" r="22" fill="none"
            stroke={fill} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 22}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 22 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 22 * (1 - pct / 100) }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-black leading-none" style={{ color: text }}>{pct}</span>
        </div>
      </div>

      {/* Labels */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[0.65rem] font-black uppercase tracking-widest" style={{ color: text }}>Sunstay Score</span>
          <span className="text-base leading-none">{emoji}</span>
        </div>
        <span className="text-[15px] font-black leading-tight" style={{ color: '#1E293B' }}>{label}</span>
        {showWindow && (
          <motion.span
            className="text-[11px] font-semibold leading-tight mt-0.5"
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
            className="text-[11px] font-semibold leading-tight mt-0.5"
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

// ── Main VenueCard ────────────────────────────────────────────
function VenueCard({ venue, weather, onClose, onCenter, cozyWeatherActive, setShowOwnerDashboard, setSelectedVenue, liveVenueFeatures }) {
  const dragControls = useDragControls();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-4, 4]), { stiffness: 200, damping: 25 });

  // Pull calculateSunstayScore + getBestWindow from context
  const { calculateSunstayScore, getBestWindow } = useWeather();

  function handlePointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function handlePointerLeave() { mouseX.set(0); mouseY.set(0); }

  const safeVenue = venue || {};
  const { name, type, suburb, lat, lng, shielding, balconyData, heating, vibe = [], tags = [] } = safeVenue;
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeVibes = Array.isArray(vibe) ? vibe : (vibe ? [vibe] : []);
  const displayName = venue?.name || venue?.title || venue?.venueName || venue?.businessName || venue?.label || 'Unknown Venue';
  const isHotelOrStay = checkIsAccommodation(venue);

  const hourlyData = weather?.rawWeather?.hourly ?? (weather?.rawWeather?.time ? weather.rawWeather : null) ?? null;
  const temp       = weather?.rawWeather?.temp ?? weather?.main?.temp ?? weather?.temp ?? 22;
  const wind       = weather?.rawWeather?.wind ?? weather?.wind?.speed ?? 0;
  // Use context-computed score (venue-adjusted) if available, fall back to prop score
  const contextScore = typeof calculateSunstayScore === 'function' ? calculateSunstayScore(venue) : null;
  const score      = contextScore ?? weather?.score ?? weather?.rawWeather?.score ?? 70;
  const uvIndex    = weather?.rawWeather?.uvIndex ?? venue?.weatherNow?.uvIndex ?? 3;
  const precipProb = weather?.rawWeather?.precipProb ?? venue?.weatherNow?.precipProb ?? 0;
  const feelsLike  = weather?.rawWeather?.feelsLike ?? temp;
  const { weatherCode } = weather || {};
  const { aqLabel } = useOpenAQ(lat, lng);
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
  const actualHappyHour  = fullVenueData?.happyHour;
  const roomIntelligence = venue?.roomIntelligence || fullVenueData?.roomIntelligence;

  const verdict = useMemo(() => {
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
    if (score > 75)      return { icon: '☀️',  text: 'Prime Outdoor Conditions', color: '#F59E0B' };
    if (score >= 50)     return { icon: '🌤️',  text: 'Good Afternoon Sun Expected', color: '#0EA5E9' };
    return               { icon: '☁️',  text: 'Overcast — Cosy Vibes Today', color: '#64748B' };
  }, [precipProb, precipProbability, wind, score, cloudcover]);

  const scoreLabel = useMemo(() => { if (score > 75) return 'Perfect Now'; if (score >= 50) return 'Good Choice'; return 'Worth a Look'; }, [score]);
  const scoreMeaningLabel = useMemo(() => { if (score >= 75) return 'Great conditions'; if (score >= 50) return 'Decent today'; return 'Not ideal'; }, [score]);

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
    () => typeof getBestWindow === 'function' ? getBestWindow(8) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getBestWindow]
  );

  const blobA = isRain ? 'rgba(14,165,233,0.12)' : 'rgba(245,158,11,0.10)';
  const blobB = isRain ? 'rgba(99,102,241,0.07)' : 'rgba(14,165,233,0.08)';
  const liveFeaturesForVenue = venue?.id ? liveVenueFeatures?.[venue.id] : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        style={{
          position: 'fixed',
          inset: 0,
          top: '72px',
          zIndex: 9998,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(6px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
        onClick={onClose}
      >
        <motion.div
          onClick={e => e.stopPropagation()}
          drag="y" dragControls={dragControls} dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.15}
          onDragEnd={(_, i) => { if (i.offset.y > 100 || i.velocity.y > 400) onClose(); }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          style={{
            rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1200,
            borderRadius: '28px 28px 0 0',
            background: 'linear-gradient(160deg, #FFFFFF 0%, #F0F4F8 55%, #E8EEF4 100%)',
            boxShadow: '0 -8px 60px rgba(0,0,0,0.12), 0 -2px 12px rgba(14,165,233,0.08), inset 0 1px 0 rgba(255,255,255,1)',
            border: '1px solid rgba(14,165,233,0.12)',
          }}
          className="pointer-events-auto mt-auto w-full select-none"
          onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: '28px 28px 0 0', zIndex: 0 }}>
            <motion.div animate={{ scale: [1, 1.18, 1], x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${blobA} 0%, transparent 65%)`, filter: 'blur(48px)' }} />
            <motion.div animate={{ scale: [1, 1.12, 1], x: [0, -30, 0], y: [0, 20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }} style={{ position: 'absolute', bottom: '15%', left: -60, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${blobB} 0%, transparent 65%)`, filter: 'blur(56px)' }} />
          </div>

          <div className="relative z-10 px-4 pb-4 pt-2 flex flex-col gap-2">
            <VenueCardHeader
              displayName={displayName}
              suburb={suburb}
              safeVibes={safeVibes}
              directSunHours={directSunHours}
              peakSunWindow={peakSunWindow}
              onClose={onClose}
              dragControls={dragControls}
              venue={venue}
            />

            {/* ── SUNSTAY SCORE BADGE + BEST WINDOW ── */}
            <SunstayScoreBadge score={score} bestWindow={bestWindow} />

            {/* LIVE PREDICTIVE NOWCAST RADAR TRACKER
                Only renders when Tomorrow.io detects rain within 45 mins.
                rainArrivalMins === 0  → 'Active'  badge  (rain right now)
                rainArrivalMins 1–45   → 'Imminent' badge (closing in)
            */}
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
            <VenueCardSun
              sunData={sunData}
              sunHours={sunHours}
              burnTimeMins={burnTimeMins}
              hourlyData={hourlyData}
              displaySunrise={displaySunrise}
              displaySunset={displaySunset}
              sunshineMins={sunshineMins}
              daylightHours={daylightHours}
              venue={venue}
            />
            <LiveSunTimeline
              sunData={sunData}
              hourlyData={hourlyData}
              cloudcover={cloudcover}
              displaySunrise={displaySunrise}
              displaySunset={displaySunset}
              peakStart={peakStartDecimal}
              peakEnd={peakEndDecimal}
            />
            <LiveSkyCondition cloudcover={cloudcover} windGusts={windGusts} precipProbability={precipProbability} />
            {lat && lng && (
              <motion.div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.10)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}>
                <div className="px-3 pt-2 pb-1"><span className="text-[0.7rem] font-black uppercase tracking-widest" style={{ color: '#94A3B8' }}>12-Hour Forecast</span></div>
                <HourlyForecastStrip lat={lat} lng={lng} dark />
              </motion.div>
            )}

            {/* WIND & COMFORT INTELLIGENCE — self-contained, reads from useWeather() context */}
            <WindComfortPanel venue={venue} />

            {shielding && (
              <motion.div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.10)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.44 }}>
                <span className="text-[0.7rem] font-black uppercase tracking-widest" style={{ color: '#94A3B8' }}>Venue Shielding</span>
                {typeof shielding.windbreak === 'number' && <ShieldBar label="Windbreak" value={Math.min(100, shielding.windbreak)} color="#0EA5E9" delay={0.1} />}
                {typeof shielding.rainCover === 'number' && <ShieldBar label="Rain Cover" value={Math.min(100, shielding.rainCover)} color="#818CF8" delay={0.2} />}
                {typeof shielding.shade    === 'number' && <ShieldBar label="Shade"      value={Math.min(100, shielding.shade)}    color="#F59E0B" delay={0.3} />}
              </motion.div>
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
            {isHotelOrStay && roomIntelligence && <RoomIntelligencePanel roomIntelligence={roomIntelligence} />}
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
            <div style={{ height: 72 }} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

VenueCard.displayName = 'VenueCard';
export default memo(VenueCard);
