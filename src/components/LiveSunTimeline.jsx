/**
 * LiveSunTimeline.jsx
 * Priority 4 — unified, interactive sun timeline.
 *
 * Props
 * ─────
 * forecast       deriveSunForecast() result, shared with the "Sun right now"
 *                card so the headline, the bar and the card always agree
 * displaySunrise string                  e.g. "6:42 AM"
 * displaySunset  string                  e.g. "5:18 PM"
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatHour } from '../utils/sunForecastState.js';

// ─── constants ────────────────────────────────────────────────────
const TIMELINE_START = 5;   // 5am left edge
const TIMELINE_END   = 22;  // 10pm right edge
const SPAN = TIMELINE_END - TIMELINE_START;

const HOUR_LABELS = [6, 9, 12, 15, 18, 21];

function pct(hour) {
  return Math.max(0, Math.min(100, ((hour - TIMELINE_START) / SPAN) * 100));
}

// ─── segment classification ───────────────────────────────────────
// Returns an array of { start, end, type: 'night'|'rain'|'cloud'|'peak'|'day' }
// from the shared forecast's hours. 'day' marks daylight with no forecast.
const KIND_TO_SEGMENT = { night: 'night', rain: 'rain', cloud: 'cloud', sun: 'peak', day: 'day' };

function buildSegments(hours) {
  const segments = [];
  for (let h = TIMELINE_START; h < TIMELINE_END; h++) {
    const type = KIND_TO_SEGMENT[hours?.[h]?.kind] ?? 'night';
    // merge with previous segment if same type
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.end = h + 1;
    } else {
      segments.push({ start: h, end: h + 1, type });
    }
  }
  return segments;
}

const SEGMENT_STYLE = {
  night: { bg: '#1E293B', label: 'Night' },
  rain:  { bg: '#64748B', label: 'Rain' },
  cloud: { bg: '#94A3B8', label: 'Cloud/Shade' },
  day:   { bg: '#CBD5E1', label: 'Daylight' },
  peak:  {
    bg: 'linear-gradient(90deg, #F59E0B 0%, #FCD34D 50%, #F97316 100%)',
    label: 'Direct Sun',
    glow: 'rgba(245,158,11,0.5)',
  },
};

const HEADLINE_COLOR = { sun: '#D97706', muted: '#64748B', night: '#475569' };

// ─── component ────────────────────────────────────────────────────
export default function LiveSunTimeline({
  forecast,
  displaySunrise,
  displaySunset,
}) {
  const nowH = forecast?.nowHour ?? 12;
  const sunsetHour = forecast?.sunsetHour ?? 24;

  const segments = useMemo(() => buildSegments(forecast?.hours), [forecast?.hours]);

  const headline = forecast?.headline
    ? { ...forecast.headline, color: HEADLINE_COLOR[forecast.headline.tone] ?? HEADLINE_COLOR.muted }
    : { text: '', emoji: '🌤️', color: HEADLINE_COLOR.muted };

  const nowPct  = pct(nowH);
  const isNight = nowH >= sunsetHour;

  // ─── legend items (only types present) ──────────────────────────
  const presentTypes = useMemo(() => [...new Set(segments.map(s => s.type))], [segments]);

  return (
    <motion.div
      className="rounded-2xl p-3 flex flex-col gap-3"
      style={{
        background: 'rgba(245,158,11,0.04)',
        border: '1px solid rgba(245,158,11,0.16)',
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {/* ── Headline ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <motion.span
          style={{ fontSize: 20, lineHeight: 1 }}
          animate={!isNight ? { scale: [1, 1.2, 1], rotate: [-5, 5, -3, 3, 0] } : {}}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {headline.emoji}
        </motion.span>
        <div className="flex flex-col">
          <span
            className="font-black leading-tight"
            style={{ fontSize: 15, color: headline.color }}
          >
            {headline.text}
          </span>
          {!isNight && displaySunrise && displaySunset && (
            <span style={{ fontSize: 10, color: '#475569', fontWeight: 800 }}>
              {displaySunrise} — {displaySunset}
            </span>
          )}
        </div>
        {/* SUN NOW badge */}
        {forecast?.now.kind === 'sun' && (
          <motion.span
            className="ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0"
            style={{ background: '#F59E0B', color: '#fff' }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            SUN NOW
          </motion.span>
        )}
      </div>

      {/* ── Timeline bar ───────────────────────────────────────── */}
      <div className="relative" style={{ height: 28 }}>
        {/* Base track */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{ background: '#1E293B' }}
        >
          {segments.map((seg, i) => {
            const style = SEGMENT_STYLE[seg.type];
            const left  = pct(seg.start);
            const right = 100 - pct(seg.end);
            return (
              <motion.div
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left:  `${left}%`,
                  right: `${right}%`,
                  background: style.bg,
                  boxShadow: style.glow ? `0 0 14px ${style.glow}, 0 0 40px ${style.glow.replace('0.5','0.2')}` : 'none',
                  transformOrigin: 'left',
                }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{
                  duration: 1.0,
                  delay: 0.08 * i,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            );
          })}

          {/* shimmer on peak segment */}
          {segments.some(s => s.type === 'peak') && (() => {
            const pk = segments.find(s => s.type === 'peak');
            const left  = pct(pk.start);
            const width = pct(pk.end) - left;
            return (
              <motion.div
                className="absolute top-0 h-full pointer-events-none"
                style={{
                  left:  `${left}%`,
                  width: `${width}%`,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                }}
                animate={{ x: [`-${width}%`, `${width}%`] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
            );
          })()}
        </div>

        {/* Live cursor */}
        <motion.div
          className="absolute top-0 h-full flex items-center"
          style={{ left: `${nowPct}%`, zIndex: 10, transform: 'translateX(-50%)' }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: 'spring', stiffness: 300, damping: 20 }}
        >
          {/* glow ring */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 22, height: 22,
              background: isNight
                ? 'rgba(148,163,184,0.25)'
                : 'rgba(245,158,11,0.30)',
              left: '50%', top: '50%',
              transform: 'translate(-50%,-50%)',
            }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0.15, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* dot */}
          <div
            style={{
              width: 10, height: 10,
              borderRadius: '50%',
              background: isNight ? '#94A3B8' : '#F59E0B',
              border: '2px solid #fff',
              boxShadow: isNight
                ? '0 0 6px rgba(148,163,184,0.8)'
                : '0 0 10px rgba(245,158,11,1), 0 0 20px rgba(245,158,11,0.5)',
              position: 'relative',
              zIndex: 2,
            }}
          />
        </motion.div>
      </div>

      {/* ── Hour labels ────────────────────────────────────────── */}
      <div className="relative" style={{ height: 14, marginTop: -2 }}>
        {HOUR_LABELS.map(h => (
          <span
            key={h}
            style={{
              position: 'absolute',
              left: `${pct(h)}%`,
              transform: 'translateX(-50%)',
              fontSize: 9,
              fontWeight: 800,
              color: '#475569',
              userSelect: 'none',
            }}
          >
            {h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
          </span>
        ))}
      </div>

      {/* ── Legend ─────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap" style={{ marginTop: -2 }}>
        {presentTypes.map(type => {
          const s = SEGMENT_STYLE[type];
          return (
            <div key={type} className="flex items-center gap-1.5">
              <div
                style={{
                  width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                  background: typeof s.bg === 'string' && s.bg.includes('gradient')
                    ? '#F59E0B'
                    : s.bg,
                  boxShadow: s.glow ? `0 0 5px ${s.glow}` : 'none',
                }}
              />
              <span style={{ fontSize: 9, fontWeight: 800, color: '#475569' }}>{s.label}</span>
            </div>
          );
        })}
        {/* Current time label next to cursor */}
        <div className="ml-auto flex items-center gap-1">
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isNight ? '#94A3B8' : '#F59E0B' }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: '#64748B' }}>Now {formatHour(nowH)}</span>
        </div>
      </div>
    </motion.div>
  );
}
