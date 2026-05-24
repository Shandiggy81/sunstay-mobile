import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const Float = ({ children, delay = 0, range = 6, duration = 4, className = '' }) => (
  <motion.div
    className={className}
    animate={{ y: [0, -range, 0] }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
  >
    {children}
  </motion.div>
);

const StatChip = ({ icon, label, value, delay = 0, className = 'flex-1 min-w-0' }) => (
  <Float delay={delay} range={4} duration={4.5} className={className}>
    <motion.div
      className="flex flex-col items-center justify-center rounded-2xl"
      style={{ padding: '8px 4px', background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.15)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
      whileHover={{ scale: 1.06, background: 'rgba(14,165,233,0.11)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span className="text-lg mb-0.5">{icon}</span>
      <span className="leading-none" style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{value}</span>
      {/* FIX A: #475569 (Slate 600) replaces #64748B — higher contrast on ambient-lit screens */}
      <span className="uppercase tracking-widest font-black mt-0.5" style={{ fontSize: '9px', color: '#475569' }}>{label}</span>
    </motion.div>
  </Float>
);

const ScoreOrb = ({ score }) => {
  const r = 38;
  const circ = r * 2 * Math.PI;
  const offset = circ - (Math.max(0, Math.min(100, score)) / 100) * circ;
  const color = score > 75 ? '#F59E0B' : score >= 50 ? '#0EA5E9' : '#94A3B8';
  const glowColor = score > 75 ? 'rgba(245,158,11,0.30)' : score >= 50 ? 'rgba(14,165,233,0.30)' : 'rgba(148,163,184,0.15)';
  return (
    <Float range={5} duration={5} delay={0.3}>
      <motion.div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: 72, height: 72, willChange: 'transform', transform: 'translateZ(0)' }}
        animate={{ boxShadow: [`0 0 0px 0px ${glowColor}`, `0 0 28px 8px ${glowColor}`, `0 0 0px 0px ${glowColor}`] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }} />
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={6} />
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
          <span className="font-black text-[1.5rem] leading-none" style={{ color: '#1E293B' }}>{Math.round(score)}</span>
          <span className="text-[9px] uppercase tracking-widest font-bold mt-0.5" style={{ color }}>Vibe</span>
        </div>
      </motion.div>
    </Float>
  );
};

const SparkLine = ({ data, color, label, unit }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const W = 110, H = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H * 0.85 - H * 0.08}`).join(' ');
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      {/* Label: dark slate for legibility on light card background */}
      <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#475569' }}>{label}</span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <polyline points={fillPts} fill={color} fillOpacity="0.12" stroke="none" />
        <motion.polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </svg>
      <div className="flex justify-between">
        {/* Min/max values: dark enough for WCAG AA on light bg */}
        <span className="text-[8px] font-black" style={{ color: '#334155' }}>{Math.round(min)}{unit}</span>
        <span className="text-[8px] font-black" style={{ color: '#1E293B' }}>{Math.round(max)}{unit}</span>
      </div>
    </div>
  );
};

export default function VenueCardWeather({
  score, scoreLabel, scoreMeaningLabel,
  feelsLike, wind, precipProb, minTemp, maxTemp, uvIndex, aqLabel,
  hourlyData, getWeatherDisplay,
}) {
  const [graphExpanded, setGraphExpanded] = useState(false);

  const buildSpark = (key, slice = 14) => Array.isArray(hourlyData?.[key])
    ? hourlyData[key].slice(0, slice).map(Number).filter(Number.isFinite)
    : [];

  return (
    <>
      <motion.div
        className="flex items-start gap-3"
        style={{ overflow: 'visible' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, type: 'spring', stiffness: 260, damping: 24 }}
      >
        <ScoreOrb score={score} />
        <div className="flex flex-col justify-center ml-1 mr-2 flex-shrink-0" style={{ paddingTop: '6px' }}>
          <span className="font-bold text-lg leading-tight tracking-wide" style={{ color: '#1E293B' }}>{scoreLabel}</span>
          <span className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#64748B' }}>For Current Weather</span>
          <span className="text-[11px] font-semibold mt-1" style={{ color: '#94A3B8' }}>{scoreMeaningLabel}</span>
        </div>
        <div className="flex-1 grid grid-cols-6 gap-1.5">
          <StatChip className="col-span-2 min-w-0" icon="🌡️" label="Feels" value={`${Math.round(feelsLike)}°`} delay={0} />
          <StatChip className="col-span-2 min-w-0" icon="💨" label="Wind" value={wind ? `${Math.round(wind)} km/h` : '–'} delay={0.08} />
          <StatChip className="col-span-2 min-w-0" icon="🌂" label="Rain" value={precipProb ? `${precipProb}%` : '0%'} delay={0.16} />
          {(minTemp !== null && maxTemp !== null) && (
            <StatChip className="col-span-2 min-w-0" icon="🌡️" label="Range" value={`${Math.round(minTemp)}–${Math.round(maxTemp)}°`} delay={0.12} />
          )}
          <StatChip className="col-span-2 min-w-0" icon="🔆" label="UV" value={uvIndex ?? '–'} delay={0.24} />
          <StatChip className="col-span-2 min-w-0" icon="🌿" label="Air" value={aqLabel} delay={0.32} />
        </div>
      </motion.div>

      {hourlyData && (
        <motion.div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(14,165,233,0.04)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(14,165,233,0.12)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            {/* Section label — dark for legibility on light card bg */}
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#334155' }}>Live Sun Exposure</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: ['Brilliant Sun','Mostly Sunny'].includes(getWeatherDisplay.label) ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)',
                color: ['Brilliant Sun','Mostly Sunny'].includes(getWeatherDisplay.label) ? '#059669' : '#475569',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {getWeatherDisplay.emoji} {getWeatherDisplay.label}
            </span>
          </div>
          <div style={{ height: 96 }}>
            <SparkLine data={buildSpark('direct_normal_irradiance', 24)} color="#F59E0B" label="Solar Intensity" unit=" W/m²" />
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setGraphExpanded(g => !g)}>
              {/* Expandable section label — dark for legibility */}
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>Temp / Cloud / Wind</span>
              <motion.div animate={{ rotate: graphExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
                <ChevronDown size={13} color="#475569" />
              </motion.div>
            </div>
            <AnimatePresence>
              {graphExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col gap-2 mt-2"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex gap-4">
                    {/* FIX 2: explicit .length checks replace truthy || short-circuit */}
                    {/* Prevents empty array [] (truthy) masking valid fallback key */}
                    <SparkLine data={buildSpark('temperature_2m').length ? buildSpark('temperature_2m') : buildSpark('temp')} color="#F59E0B" label="Temperature" unit="°" />
                    <SparkLine data={buildSpark('cloud_cover').length ? buildSpark('cloud_cover') : buildSpark('cloudcover')} color="#94A3B8" label="Cloud" unit="%" />
                  </div>
                  <div className="flex gap-4">
                    <SparkLine data={buildSpark('wind_speed_10m').length ? buildSpark('wind_speed_10m') : buildSpark('windspeed_10m')} color="#0EA5E9" label="Wind" unit=" km/h" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </>
  );
}
