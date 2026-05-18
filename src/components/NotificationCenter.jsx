/**
 * NotificationCenter.jsx
 * Priority 5 — Real-time in-app toast alerts for weather & sun shifts.
 *
 * Props
 * ─────
 * venue        current selected venue object (or null)
 * weather      weather object from WeatherContext
 * sunData      { startHour, endHour } from getSunData()
 * score        numeric comfort score (0–100)
 *
 * The component fires up to ONE toast at a time.
 * Toasts auto-dismiss after 8 s. setInterval is cleaned up on unmount.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── constants ────────────────────────────────────────────────────
const AUTO_DISMISS_MS  = 8_000;
const POLL_INTERVAL_MS = 60_000;   // check rules every 60 s
const COOLDOWN_MS      = 10 * 60_000; // same alert key won't re-fire for 10 min

// ── helpers ────────────────────────────────────────────────────
function decimalNow() {
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60;
}

function getCloudAtHour(cloudcover, hour) {
  if (Array.isArray(cloudcover)) return cloudcover[hour] ?? cloudcover[0] ?? 0;
  return typeof cloudcover === 'number' ? cloudcover : 0;
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
/**
 * Returns the first matching alert rule, or null.
 * @param {object} opts
 * @returns {{ key: string, emoji: string, title: string, body: string, accent: string } | null}
 */
function evaluateRules({ nowH, peakStart, peakEnd, sunsetHour, score, hourlyData, cloudcover }) {
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
        top:             72,          // clears the TopBar
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
      {/* Icon */}
      <motion.div
        animate={{ scale: [1, 1.25, 0.9, 1.15, 1], rotate: [-6, 6, -4, 4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, marginTop: 1 }}
      >
        {emoji}
      </motion.div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 800,
          color: '#1E293B',
          lineHeight: 1.25,
        }}>{title}</p>
        <p style={{
          margin: '3px 0 0',
          fontSize: 12,
          fontWeight: 500,
          color: '#475569',
          lineHeight: 1.4,
        }}>{body}</p>
      </div>

      {/* Accent bar */}
      <div style={{
        position:     'absolute',
        left:         0, top: 0, bottom: 0,
        width:        4,
        borderRadius: '20px 0 0 20px',
        background:   accent,
        opacity:      0.85,
      }} />

      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
        style={{
          position:       'absolute',
          bottom:         0, left: 0, right: 0,
          height:         3,
          borderRadius:   '0 0 20px 20px',
          background:     accent,
          opacity:        0.5,
          transformOrigin:'left',
        }}
      />

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        style={{
          flexShrink:   0,
          background:   'none',
          border:       'none',
          cursor:       'pointer',
          padding:      '2px 4px',
          color:        '#94A3B8',
          fontSize:     18,
          lineHeight:   1,
          borderRadius: 8,
          marginTop:    -2,
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
  // cooldown registry: { [alertKey]: timestampMs }
  const cooldownRef  = useRef({});
  const dismissTimer = useRef(null);

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

  // Resolve sun window from sunData or sensible defaults
  const peakStart = Number.isFinite(sunData?.startHour) ? sunData.startHour : null;
  const peakEnd   = Number.isFinite(sunData?.endHour)   ? sunData.endHour   : null;
  const sunsetHour = peakEnd ?? 17.5;

  // Pull cloud/rain data from weather prop
  const hourlyData = useMemo(() =>
    weather?.rawWeather?.hourly ??
    (weather?.rawWeather?.time ? weather.rawWeather : null) ??
    null,
    [weather]
  );

  const cloudcover = useMemo(() =>
    weather?.cloudCover ??
    (Array.isArray(hourlyData?.cloud_cover) ? hourlyData.cloud_cover : null) ??
    (Array.isArray(hourlyData?.cloudcover)  ? hourlyData.cloudcover  : null),
    [weather, hourlyData]
  );

  // ── Poll engine ──────────────────────────────────────────────────
  const runRules = useCallback(() => {
    // Only fire alerts when a venue is open
    if (!venue) return;

    const nowH = decimalNow();
    const alert = evaluateRules({
      nowH,
      peakStart,
      peakEnd,
      sunsetHour,
      score,
      hourlyData,
      cloudcover,
    });
    if (!alert) return;

    // Respect per-key cooldown
    const lastFired = cooldownRef.current[alert.key] ?? 0;
    if (Date.now() - lastFired < COOLDOWN_MS) return;

    // Don’t interrupt an identical active toast
    if (activeToast?.key === alert.key) return;

    fireToast(alert);
  }, [venue, peakStart, peakEnd, sunsetHour, score, hourlyData, cloudcover, activeToast, fireToast]);

  // Run once immediately when venue or weather changes, then poll every minute
  useEffect(() => {
    runRules();
    const id = setInterval(runRules, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearDismissTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id, weather, sunData, score]);

  // Cleanup dismiss timer on unmount
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
