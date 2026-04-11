import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { MapPin, Share2, ChevronDown } from 'lucide-react';
import { getSunPositionForMap } from '../util/sunPosition';
import { venues } from '../data/venues';
import { FEATURE_BADGES } from '../config/features';
import WeatherWidget from './WeatherWidget';
import HourlyForecastStrip from './HourlyForecastStrip';
import SunTimeline from './SunTimeline';
import { getSunData } from '../utils/getSunData';

function isHappyHourNow(happyHour) {
  if (!happyHour) return false;
  const now = new Date();
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
  if (!happyHour.days.includes(day)) return false;
  const [sh, sm] = happyHour.start.split(':').map(Number);
  const [eh, em] = happyHour.end.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

function calcOutdoorSun(venue, hourlyData) {
  if (!hourlyData?.time) return { balcony: 0, pool: 0 };
  let b = 0, p = 0;
  for (let i = 0; i < hourlyData.time.length; i++) {
    const irrad = hourlyData.direct_normal_irradiance[i];
    const { altitude } = getSunPositionForMap(venue.lat, venue.lng, new Date(hourlyData.time[i]));
    if (irrad > 120) { if (altitude > 15) b++; if (altitude > 20) p++; }
  }
  return { balcony: b, pool: p };
}

const Float = ({ children, delay = 0, range = 6, duration = 4, className = '' }) => (
  <motion.div
    className={className}
    animate={{ y: [0, -range, 0] }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
  >
    {children}
  </motion.div>
);

const ScoreOrb = ({ score }) => {
  const r = 38;
  const circ = r * 2 * Math.PI;
  const offset = circ - (Math.max(0, Math.min(100, score)) / 100) * circ;
  const color = score > 75 ? '#F59E0B' : score >= 50 ? '#38BDF8' : '#94A3B8';
  const glowColor = score > 75 ? 'rgba(245,158,11,0.35)' : score >= 50 ? 'rgba(56,189,248,0.35)' : 'rgba(148,163,184,0.2)';
  return (
    <Float range={5} duration={5} delay={0.3}>
      <motion.div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: 96, height: 96 }}
        animate={{ boxShadow: [`0 0 0px 0px ${glowColor}`, `0 0 28px 8px ${glowColor}`, `0 0 0px 0px ${glowColor}`] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }} />
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
          <defs>
            <linearGradient id="og" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>
          </defs>
          <motion.circle
            cx="50" cy="50" r={r} fill="none"
            stroke={score > 75 ? 'url(#og)' : color}
            strokeWidth={6}
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.8, ease: 'easeOut', delay: 0.4 }}
            strokeLinecap="round"
          />
        </svg>
        <div className="flex flex-col items-center justify-center text-center z-10">
          <span className="text-white font-black text-[22px] leading-none">{Math.round(score)}</span>
          <span className="text-[9px] uppercase tracking-widest font-bold mt-0.5" style={{ color }}>Score</span>
        </div>
      </motion.div>
    </Float>
  );
};

const StatChip = ({ icon, label, value, delay = 0 }) => (
  <Float delay={delay} range={4} duration={4.5} className="flex-1 min-w-0">
    <motion.div
      className="flex flex-col items-center justify-center rounded-2xl py-3 px-1"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)' }}
      whileHover={{ scale: 1.06, background: 'rgba(255,255,255,0.07)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span className="text-lg mb-0.5">{icon}</span>
      <span className="text-white font-black text-[13px] leading-none">{value}</span>
      <span className="text-white/35 text-[8px] uppercase tracking-widest font-bold mt-0.5">{label}</span>
    </motion.div>
  </Float>
);

const GoldenWindowBar = ({ sunData }) => {
  if (!sunData || typeof sunData.startHour !== 'number') return null;
  const START = 6, END = 21, TOTAL = END - START;
  const clampedStart = Math.max(START, sunData.startHour);
  const clampedEnd = Math.min(END, sunData.endHour);
  const left = ((clampedStart - START) / TOTAL) * 100;
  const width = ((clampedEnd - clampedStart) / TOTAL) * 100;
  const hours = Math.round(clampedEnd - clampedStart);
  const now = new Date();
  const nowPct = Math.max(0, Math.min(100, ((now.getHours() + now.getMinutes() / 60) - START) / TOTAL * 100));
  const labels = [6, 9, 12, 15, 18, 21];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
          <motion.span animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'inline-block' }}>☀️</motion.span>
          Golden Window
        </span>
        <motion.span className="text-amber-300 text-[11px] font-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>{hours}h direct sun today</motion.span>
      </div>
      <div className="relative h-6 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <motion.div
          className="absolute h-full rounded-full"
          style={{ left: `${left}%`, background: 'linear-gradient(90deg, #F59E0B, #FDE68A, #F97316)', boxShadow: '0 0 16px rgba(245,158,11,0.6), 0 0 40px rgba(245,158,11,0.2)' }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: `${width}%`, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        />
        <motion.div
          className="absolute top-0 h-full w-12 rounded-full"
          style={{ left: `${left}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }}
          animate={{ x: ['0%', `${width * 4}px`, '0%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
        <motion.div
          className="absolute top-0 h-full w-0.5 rounded-full"
          style={{ left: `${nowPct}%`, background: 'rgba(255,255,255,0.7)' }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="flex justify-between px-0.5">
        {labels.map(h => <span key={h} className="text-white/20 text-[8px] font-bold">{h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</span>)}
      </div>
    </div>
  );
};

const ShieldBar = ({ label, value, color, delay = 0 }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between">
      <span className="text-white/40 text-[9px] font-black uppercase tracking-widest">{label}</span>
      <span className="text-white/60 text-[9px] font-black">{Math.round(value * 100)}%</span>
    </div>
    <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color.includes('38BDF8') ? 'rgba(56,189,248,0.4)' : 'rgba(245,158,11,0.4)'}` }}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
      />
    </div>
  </div>
);

const SparkLine = ({ data, color, label, unit }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const W = 110, H = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H * 0.85 - H * 0.08}`).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <span className="text-white/30 text-[8px] uppercase tracking-widest font-black">{label}</span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <polyline points={fillPts} fill={color} fillOpacity="0.08" stroke="none" />
        <motion.polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.9 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </svg>
      <div className="flex justify-between">
        <span className="text-white/40 text-[8px] font-black">{Math.round(min)}{unit}</span>
        <span className="text-white/70 text-[8px] font-black">{Math.round(max)}{unit}</span>
      </div>
    </div>
  );
};

const RoomIntelligencePanel = ({ roomIntelligence }) => {
  if (!roomIntelligence) return null;
  const items = [
    roomIntelligence.sunriseView && { icon: '🌅', label: 'Sunrise View' },
    roomIntelligence.floorLevel && { icon: '🏢', label: `Floor ${roomIntelligence.floorLevel}` },
    roomIntelligence.poolAccess && { icon: '🏊', label: 'Pool Access' },
    roomIntelligence.balcony && { icon: '🪟', label: 'Private Balcony' },
  ].filter(Boolean);
  return (
    <motion.div className="rounded-2xl p-4" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.14)' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <span className="text-sky-400 text-[9px] font-black uppercase tracking-widest block mb-3">🛎 Room Intelligence</span>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span>{item.icon}</span>
            <span className="text-white/60 text-[11px] font-semibold">{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default function VenueCard({ venue, weather, onClose, onCenter, cozyWeatherActive, setShowOwnerDashboard, setSelectedVenue, liveVenueFeatures }) {
  const dragControls = useDragControls();
  const [graphExpanded, setGraphExpanded] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-4, 4]), { stiffness: 200, damping: 25 });

  function handlePointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function handlePointerLeave() { mouseX.set(0); mouseY.set(0); }

  const { name, type, suburb, emoji, lat, lng, shielding, balconyData, heating } = venue;
  const isHotelOrStay = ['hotel','airbnb','accommodation','stay','apartment'].some(t => (type || '').toLowerCase().includes(t));
  const hourlyData = weather?.rawWeather?.hourly ?? weather?.rawWeather ?? null;
  const temp       = weather?.rawWeather?.temp ?? weather?.main?.temp ?? weather?.temp ?? 22;
  const wind       = weather?.rawWeather?.wind ?? weather?.wind?.speed ?? 0;
  const score      = weather?.score ?? weather?.rawWeather?.score ?? 70;
  const uvIndex    = weather?.rawWeather?.uvIndex ?? venue.weatherNow?.uvIndex ?? 3;
  const precipProb = weather?.rawWeather?.precipProb ?? venue.weatherNow?.precipProb ?? 0;
  const feelsLike  = weather?.rawWeather?.feelsLike ?? temp;

  const sunData = useMemo(() => (lat && lng) ? getSunData(lat, lng) : null, [lat, lng]);
  const outdoorSun = useMemo(() => isHotelOrStay ? calcOutdoorSun(venue, hourlyData) : { balcony: 0, pool: 0 }, [venue, hourlyData, isHotelOrStay]);
  const sunHours = useMemo(() => {
    if (isHotelOrStay && (outdoorSun.balcony > 0 || outdoorSun.pool > 0))
      return { outdoor: `${outdoorSun.balcony}h`, covered: `${outdoorSun.pool}h`, labels: { outdoor: 'Balcony', covered: 'Pool' } };
    return { outdoor: `${Math.floor(6 + Math.random() * 4)}h`, covered: `${Math.floor(4 + Math.random() * 4)}h`, labels: { outdoor: 'Outdoor', covered: 'Covered' } };
  }, [isHotelOrStay, outdoorSun]);

  const weatherCondition = useMemo(() => {
    if (weather?.weather?.[0]?.main) return weather.weather[0].main.toLowerCase();
    const code = weather?.rawWeather?.weatherCode;
    if (code >= 51 && code <= 95) return 'rain';
    if (code >= 1 && code <= 3) return 'cloudy';
    return 'clear';
  }, [weather]);
  const isRain = weatherCondition.includes('rain') || weatherCondition.includes('shower');

  const fullVenueData = venues.find(v => (name || '').toLowerCase().includes((v.name || '').toLowerCase()) || (v.name || '').toLowerCase().includes((name || '').toLowerCase()));
  const actualHappyHour  = fullVenueData?.happyHour;
  const roomIntelligence = venue.roomIntelligence || fullVenueData?.roomIntelligence;

  const verdict = useMemo(() => {
    if (precipProb > 60) return { icon: '🌧️', text: 'Wet Conditions — Check Cover', color: '#38BDF8' };
    if (wind > 30)       return { icon: '🌬️', text: 'High Wind — Sit Indoors',      color: '#94A3B8' };
    if (score > 75)      return { icon: '☀️',  text: 'Prime Outdoor Conditions',    color: '#F59E0B' };
    if (score >= 50)     return { icon: '🌤️',  text: 'Good Afternoon Sun Expected', color: '#34D399' };
    return               { icon: '☁️',  text: 'Overcast — Cosy Vibes Today',    color: '#64748B' };
  }, [precipProb, wind, score]);

  const buildSpark = (key, slice = 14) => hourlyData?.[key] ? hourlyData[key].slice(0, slice).map(Number) : [];

  const displaySunrise = useMemo(() => {
    if (venue.sunrise) return venue.sunrise;
    if (weather?.sys?.sunrise) return new Date(weather.sys.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return '--';
  }, [venue.sunrise, weather?.sys?.sunrise]);

  const displaySunset = useMemo(() => {
    if (venue.sunset) return venue.sunset;
    if (weather?.sys?.sunset) return new Date(weather.sys.sunset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return '--';
  }, [venue.sunset, weather?.sys?.sunset]);

  const blobA = isRain ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.2)';
  const blobB = isRain ? 'rgba(99,102,241,0.12)' : 'rgba(239,68,68,0.1)';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9999] w-full h-full flex flex-col"
        style={{ top: '72px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      >
        <div className="absolute z-[10000] pointer-events-none" style={{ top: 'max(env(safe-area-inset-top,16px),16px)', left: '16px' }}>
          <motion.button
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 25 }}
            onClick={onClose}
            className="pointer-events-auto flex items-center gap-2 font-black text-sm px-4 py-2 rounded-full"
            style={{ background: 'rgba(15,23,42,0.82)', color: '#F1F5F9', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          >
            <span className="text-base">←</span> Back
          </motion.button>
        </div>

        <motion.div
          onClick={e => e.stopPropagation()}
          drag="y" dragControls={dragControls} dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.15}
          onDragEnd={(_, i) => { if (i.offset.y > 100 || i.velocity.y > 400) onClose(); }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1200, maxHeight: 'calc(100vh - env(safe-area-inset-top,20px) - 72px)', borderRadius: '28px 28px 0 0', background: 'linear-gradient(160deg, #0D1B2A 0%, #0F172A 55%, #080D1A 100%)', boxShadow: '0 -8px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)' }}
          className="pointer-events-auto mt-auto w-full overflow-y-auto select-none"
          onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: '28px 28px 0 0', zIndex: 0 }}>
            <motion.div animate={{ scale: [1, 1.18, 1], x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${blobA} 0%, transparent 65%)`, filter: 'blur(48px)' }} />
            <motion.div animate={{ scale: [1, 1.12, 1], x: [0, -30, 0], y: [0, 20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }} style={{ position: 'absolute', bottom: '15%', left: -60, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${blobB} 0%, transparent 65%)`, filter: 'blur(56px)' }} />
          </div>

          <div className="relative z-10 px-4 pb-10 pt-2 flex flex-col gap-4">
            <div className="flex justify-center pt-3 pb-0 md:hidden" onPointerDown={e => dragControls.start(e)} style={{ touchAction: 'none' }}>
              <motion.div style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(245,158,11,0.5)' }} animate={{ scaleX: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
            </div>

            <motion.div className="flex items-start gap-4 pt-1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, type: 'spring', stiffness: 280, damping: 28 }}>
              <Float range={5} duration={5} delay={0.2} className="flex-shrink-0">
                <motion.div className="flex items-center justify-center text-[30px] rounded-2xl" style={{ width: 62, height: 62, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)', transformStyle: 'preserve-3d' }} whileHover={{ rotateY: 180, scale: 1.08 }} transition={{ duration: 0.5 }}>{emoji}</motion.div>
              </Float>
              <div className="flex-1 min-w-0 pt-2">
                <h2 className="text-white font-black text-[21px] leading-tight truncate" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>{name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>{type}</span>
                  <span className="text-white/25 text-[9px]">·</span>
                  <span className="text-white/45 text-[11px] font-semibold flex items-center gap-1"><MapPin size={9} className="text-amber-400/70" />{suburb}</span>
                </div>
              </div>
              <ScoreOrb score={score} />
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 24 }} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${verdict.color}28`, boxShadow: `0 0 32px ${verdict.color}12, inset 0 1px 0 rgba(255,255,255,0.04)` }}>
              <Float range={3} duration={3} delay={0}><span className="text-xl">{verdict.icon}</span></Float>
              <span className="font-black text-[13px]" style={{ color: verdict.color }}>{verdict.text}</span>
            </motion.div>

            <motion.div className="flex gap-2.5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, type: 'spring', stiffness: 260, damping: 24 }}>
              <StatChip icon="🌡️" label="Feels Like" value={`${Math.round(feelsLike)}°`} delay={0} />
              <StatChip icon="💨" label="Wind"       value={`${Math.round(wind)} km`}     delay={0.08} />
              <StatChip icon="🌂" label="Rain"       value={`${Math.round(precipProb)}%`} delay={0.16} />
              <StatChip icon="🔆" label="UV"         value={uvIndex ?? '–'}               delay={0.24} />
            </motion.div>

            <motion.div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
              <GoldenWindowBar sunData={sunData} />
              <div className="flex gap-5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex flex-col"><span className="text-white/30 text-[8px] uppercase tracking-widest font-black">Sunrise</span><span className="text-amber-300 font-black text-sm">{displaySunrise}</span></div>
                <div className="flex flex-col"><span className="text-white/30 text-[8px] uppercase tracking-widest font-black">Sunset</span><span className="text-orange-300 font-black text-sm">{displaySunset}</span></div>
                <div className="flex flex-col ml-auto items-end"><span className="text-white/30 text-[8px] uppercase tracking-widest font-black">{sunHours.labels.outdoor}</span><span className="text-white font-black text-sm">{sunHours.outdoor}</span></div>
                <div className="flex flex-col items-end"><span className="text-white/30 text-[8px] uppercase tracking-widest font-black">{sunHours.labels.covered}</span><span className="text-white font-black text-sm">{sunHours.covered}</span></div>
              </div>
            </motion.div>

            {lat && lng && (
              <motion.div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}>
                <div className="px-4 pt-3 pb-1"><span className="text-white/30 text-[9px] font-black uppercase tracking-widest">12-Hour Forecast</span></div>
                <HourlyForecastStrip lat={lat} lng={lng} dark />
              </motion.div>
            )}

            {sunData && (
              <motion.div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }}>
                <span className="text-white/30 text-[9px] font-black uppercase tracking-widest block mb-3">Sun Position Today</span>
                <SunTimeline sunData={sunData} dark />
              </motion.div>
            )}

            <motion.div className="rounded-2xl overflow-hidden cursor-pointer" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} onClick={() => setGraphExpanded(g => !g)} whileHover={{ background: 'rgba(255,255,255,0.035)' }}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><span className="text-indigo-400">📈</span> Climate Graphs</span>
                <motion.div animate={{ rotate: graphExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}><ChevronDown size={15} className="text-white/25" /></motion.div>
              </div>
              <AnimatePresence>
                {graphExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }} className="px-4 pb-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-4">
                      <SparkLine data={buildSpark('temperature_2m')} color="#F59E0B" label="Temperature" unit="°" />
                      <SparkLine data={buildSpark('direct_normal_irradiance')} color="#FDE68A" label="Solar" unit="" />
                    </div>
                    <div className="flex gap-4">
                      <SparkLine data={buildSpark('cloudcover')} color="#94A3B8" label="Cloud" unit="%" />
                      <SparkLine data={buildSpark('windspeed_10m')} color="#38BDF8" label="Wind" unit=" km" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {shielding && (
              <motion.div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.44 }}>
                <span className="text-white/30 text-[9px] font-black uppercase tracking-widest">Venue Shielding</span>
                {typeof shielding.windbreak === 'number' && <ShieldBar label="Windbreak" value={shielding.windbreak} color="#38BDF8" delay={0.1} />}
                {typeof shielding.rainCover === 'number' && <ShieldBar label="Rain Cover" value={shielding.rainCover} color="#818CF8" delay={0.2} />}
                {typeof shielding.shade    === 'number' && <ShieldBar label="Shade"      value={shielding.shade}    color="#F59E0B" delay={0.3} />}
              </motion.div>
            )}

            {balconyData && (
              <Float range={3} duration={5.5} delay={0.5}>
                <div className="rounded-2xl p-4 flex justify-between items-center" style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.13)' }}>
                  <div><span className="text-sky-400 text-[9px] font-black uppercase tracking-widest block mb-1">🪟 Balcony</span><span className="text-white font-black text-lg">{balconyData.hours}h Sun</span></div>
                  <div className="text-right"><span className="text-white/35 text-[10px] font-bold block">{balconyData.direction}</span><span className="text-white/60 text-sm font-semibold">{balconyData.views}</span></div>
                </div>
              </Float>
            )}

            {isHotelOrStay && roomIntelligence && <RoomIntelligencePanel roomIntelligence={roomIntelligence} />}

            {heating && !['no heating','indoor only','heated outdoor'].includes(heating) && (
              <Float range={4} duration={4} delay={0.1}>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
                  <motion.span className="text-xl" animate={{ scale: [1, 1.15, 0.95, 1.1, 1], rotate: [-3, 3, -2, 2, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>🔥</motion.span>
                  <span className="text-amber-300 text-sm font-black">{heating === 'electric-fireplace' ? 'Premium Electric Fireplace' : heating === 'traditional-fireplace' ? 'Traditional Gas Fireplace' : 'Fireplace Active'}</span>
                </div>
              </Float>
            )}

            {actualHappyHour && (
              <Float range={3} duration={6} delay={0.4}>
                <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.18)' }}>
                  <div>
                    <span className="text-orange-400 text-[9px] font-black uppercase tracking-widest block mb-0.5">🍻 Happy Hour · {actualHappyHour.start} – {actualHappyHour.end}</span>
                    <span className="text-white font-black text-[15px]">{actualHappyHour.deal}</span>
                  </div>
                  {isHappyHourNow(actualHappyHour) && (
                    <motion.span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ml-3 flex-shrink-0" style={{ background: '#F97316', color: '#fff' }} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>LIVE</motion.span>
                  )}
                </div>
              </Float>
            )}

            {liveVenueFeatures?.[venue.id] && Object.values(liveVenueFeatures[venue.id]).some(Boolean) && (
              <div className="flex flex-wrap gap-2 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {Object.entries(liveVenueFeatures[venue.id]).map(([key, active], i) =>
                  active && FEATURE_BADGES[key] ? (
                    <Float key={key} range={2} duration={4 + i * 0.3} delay={i * 0.05}>
                      <span className="text-[10px] font-black px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.08)' }}>{FEATURE_BADGES[key]}</span>
                    </Float>
                  ) : null
                )}
              </div>
            )}

            {cozyWeatherActive && (
              <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}>
                <Float range={4} duration={4}><span>☕</span></Float>
                <span className="text-indigo-300 text-sm font-black">Cozy Indoor · Heaters · Shelter</span>
              </div>
            )}

            <motion.button
              onClick={() => { setShowOwnerDashboard(true); setSelectedVenue(venue); }}
              className="w-full font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', boxShadow: '0 4px 24px rgba(13,148,136,0.35)' }}
              whileHover={{ scale: 1.02, boxShadow: '0 6px 30px rgba(13,148,136,0.45)' }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            >🏢 Manage This Venue</motion.button>

            <div className="flex gap-3 pb-2">
              <motion.button className="flex-1 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #1D4ED8, #2563EB)', color: '#fff', boxShadow: '0 4px 24px rgba(37,99,235,0.3)' }} onClick={onCenter} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
                <MapPin size={14} /> Centre Map
              </motion.button>
              <motion.button className="flex-1 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #B45309, #D97706)', color: '#fff', boxShadow: '0 4px 24px rgba(217,119,6,0.3)' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
                <Share2 size={14} /> Share
              </motion.button>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
