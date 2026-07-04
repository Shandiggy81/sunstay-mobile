/**
 * NotificationCenter.jsx
 * Priority 5 — Real-time in-app toast alerts for weather & sun shifts.
 *
 * Props
 * ─────
 * venue        current selected venue object (or null)
 * weather      weather object from WeatherContext
 * sunData      { startHour, endHour } from getSunData() — raw sunrise/sunset
 * score        numeric comfort score (0–100)
 *
 * Peak Window definition
 * ──────────────────────
 * Raw sunrise/sunset from getSunData() spans the whole day (e.g. 6 am – 8 pm).
 * We clamp this to a true "prime sun" window by shrinking 2.5 h from each end,
 * then hard-clamping between 11:00 and 15:00 so toasts never fire at dawn/dusk.
 *
 * Toast lifecycle fix
 * ───────────────────
 * The poll useEffect intentionally uses a stable dep array [venue?.id, score]
 * so that background weather/sunData prop changes don't re-run the effect and
 * cancel the dismissTimer mid-countdown. Weather/sunData are accessed via refs
 * inside runRules() instead, keeping the closure fresh without the effect re-firing.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── constants ────────────────────────────────────────────────────
const AUTO_DISMISS_MS  = 8_000;
const POLL_INTERVAL_MS = 60_000;
const COOLDOWN_MS      = 10 * 60_000;

// Peak window hard bounds — toasts never fire outside 11:00–15:00 local
const PEAK_HARD_MIN = 11.0;
const PEAK_HARD_MAX = 15.0;
// How many hours to shave off each end of the raw sunrise/sunset window
const PEAK_SHRINK_HRS = 2.5;

/**
 * Derive a true peak sun window from raw sunrise/sunset decimal hours.
 * Falls back to the hard bounds if sunData is missing or invalid.
 */
function derivePeakWindow(sunData) {
  const rawStart = Number.isFinite(sunData?.startHour) ? sunData.startHour : null;
  const rawEnd   = Number.isFinite(sunData?.endHour)   ? sunData.endHour   : null;

  const start = rawStart != null
    ? Math.max(PEAK_HARD_MIN, rawStart + PEAK_SHRINK_HRS)
    : PEAK_HARD_MIN;

  const end = rawEnd != null
    ? Math.min(PEAK_HARD_MAX, rawEnd - PEAK_SHRINK_HRS)
    : PEAK_HARD_MAX;

  // Sanity: if the shrunk window is inverted (very short days), collapse to midday
  return start < end ? { peakStart: start, peakEnd: end } : { peakStart: 11.5, peakEnd: 14.5 };
}

// ── helpers ────────────────────────────────────────────────────
function decimalNow() {
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60;
}

function getNextHourRainProb(hourlyData) {
  if (!hourlyData) return 0;
  const nextHour = new Date().getHours() + 1;
  const pp = hourlyData.precipitation_probability
    ?? hourlyData.precip_probability
    ?? hourlyData.precipProbability;
  if (Array.isArray(pp)) return pp[nextHour] ?? pp[0] ?? 0;
  return 0;
}

// ── alert rule engine ──────────────────────────────────────────────
function evaluateRules({ nowH, peakStart, peakEnd, score, hourlyData }) {
  // 1 — Golden Alert: 10–15 mins before peak sun starts
  if (peakStart != null) {
    const minsUntilPeak = (peakStart - nowH) * 60;
    if (minsUntilPeak >= 8 && minsUntilPeak <= 16) {
      return {
        key:    'golden',
        emoji:  '\u2600\ufe0f',
        title:  'Sun breaking through soon',
        body:   'Direct sun in ~10 mins. Perfect time to grab a table outside.',
        accent: '#F59E0B',
      };
    }
  }

  // 2 — Rain Warning: next-hour rain prob > 40%
  const nextRain = getNextHourRainProb(hourlyData);
  if (nextRain > 40) {
    return {
      key:    'rain',
      emoji:  '\ud83c\udf27\ufe0f',
      title:  'Cloud rolling in soon',
      body:   `${Math.round(nextRain)}% chance of rain next hour. Enjoy the sun while it lasts!`,
      accent: '#0EA5E9',
    };
  }

  // 3 — Vibe Check: great conditions AND inside peak window right now
  if (
    score >= 75 &&
    peakStart != null &&
    peakEnd   != null &&
    nowH >= peakStart &&
    nowH <  peakEnd
  ) {
    return {
      key:    'vibe',
      emoji:  '\ud83c\udf7a',
      title:  'Beer garden prime time!',
      body:   "It's beautiful out there right now. Get amongst it.",
      accent: '#F97316',
    };
  }

  return null;
}

// ── Toast UI ─────────────────────────────────────────────────────
function SunToast({ toast, onDismiss }) {
  const { emoji, title, body, accent } = toast;
  return (
    <motion.div
      layout
      initial={{ y: -80, opacity: 0, scale: 0.92 }}
      animate={{ y: 0,   opacity: 1, scale: 1    }}
      exit={{    y: -80, opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      style={{
        position:        'fixed',
        top:             72,
        left:            '50%',
        transform:       'translateX(-50%)',
        zIndex:          99999,
        width:           'min(calc(100vw - 24px), 420px)',
        background:      'rgba(255,255,255,0.97)',
        backdropFilter:  'blur(18px)',
        borderRadius:    20,
        border:          `1.5px solid ${accent}44`,
        boxShadow:       `0 8px 40px rgba(0,0,0,0.14), 0 0 0 1px ${accent}22, 0 2px 0 ${accent}33 inset`,
        padding:         '14px 16px',
        display:         'flex',
        alignItems:      'flex-start',
        gap:             12,
        pointerEvents:   'auto',
      }}
      role="alert"
      aria-live="assertive"
    >
      <motion.div
        animate={{ scale: [1, 1.25, 0.9, 1.15, 1], rotate: [-6, 6, -4, 4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, marginTop: 1 }}
      >
        {emoji}
      </motion.div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 800,
          color: '#1E293B', lineHeight: 1.25,
        }}>{title}</p>
        <p style={{
          margin: '3px 0 0', fontSize: 12, fontWeight: 500,
          color: '#475569', lineHeight: 1.4,
        }}>{body}</p>
      </div>

      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        borderRadius: '20px 0 0 20px', background: accent, opacity: 0.85,
      }} />

      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, borderRadius: '0 0 20px 20px',
          background: accent, opacity: 0.5, transformOrigin: 'left',
        }}
      />

      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          cursor: 'pointer', padding: '2px 4px',
          color: '#94A3B8', fontSize: 18, lineHeight: 1,
          borderRadius: 8, marginTop: -2,
        }}
      >
        ×
      </button>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────────────
export default function NotificationCenter({ venue, weather, sunData, score = 70 }) {
  const [activeToast, setActiveToast] = useState(null);
  const cooldownRef  = useRef({});
  const dismissTimer = useRef(null);

  // ── Stable refs for props consumed inside the polling closure ──
  // This means the poll useEffect never needs weather/sunData in its
  // dep array — no more effect re-runs (and clearDismissTimer calls)
  // every time the WeatherContext updates in the background.
  const weatherRef = useRef(weather);
  const sunDataRef = useRef(sunData);
  const scoreRef   = useRef(score);
  useEffect(() => { weatherRef.current = weather; }, [weather]);
  useEffect(() => { sunDataRef.current = sunData;  }, [sunData]);
  useEffect(() => { scoreRef.current   = score;    }, [score]);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    setActiveToast(null);
  }, [clearDismissTimer]);

  const fireToast = useCallback((alert) => {
    clearDismissTimer();
    setActiveToast({ ...alert, id: Date.now() });
    dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    cooldownRef.current[alert.key] = Date.now();
  }, [clearDismissTimer, dismiss]);

  // ── Poll engine — reads fresh data via refs, never re-creates the
  // interval unless venue or score actually changes. ────────────────
  const runRules = useCallback(() => {
    if (!venue) return;

    const currentWeather = weatherRef.current;
    const currentSunData = sunDataRef.current;
    const currentScore   = scoreRef.current;

    const { peakStart, peakEnd } = derivePeakWindow(currentSunData);

    const hourlyData =
      currentWeather?.rawWeather?.hourly ??
      (currentWeather?.rawWeather?.time ? currentWeather.rawWeather : null) ??
      null;

    const nowH  = decimalNow();
    const alert = evaluateRules({ nowH, peakStart, peakEnd, score: currentScore, hourlyData });
    if (!alert) return;

    const lastFired = cooldownRef.current[alert.key] ?? 0;
    if (Date.now() - lastFired < COOLDOWN_MS) return;

    // Don't interrupt an identical active toast — read from state via
    // functional updater to avoid stale closure without adding activeToast
    // to deps (which would recreate the interval every time a toast fires).
    setActiveToast(prev => {
      if (prev?.key === alert.key) return prev;
      clearDismissTimer();
      const newToast = { ...alert, id: Date.now() };
      cooldownRef.current[alert.key] = Date.now();
      dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
      return newToast;
    });
  }, [venue, dismiss, clearDismissTimer]);

  // Stable dep array — only [venue?.id, score] so the interval is NOT
  // torn down / rebuilt every time weather or sunData props refresh.
  useEffect(() => {
    runRules();
    const id = setInterval(runRules, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      // Do NOT call clearDismissTimer here — we only want to cancel it on
      // true unmount (handled below), not on every score/venue change.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id, score]);

  // True unmount cleanup only
  useEffect(() => () => clearDismissTimer(), [clearDismissTimer]);

  return (
    <AnimatePresence mode="wait">
      {activeToast && (
        <SunToast
          key={activeToast.id}
          toast={activeToast}
          onDismiss={dismiss}
        />
      )}
    </AnimatePresence>
  );
}
