import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { calculateBalconySun } from '../utils/calculateBalconySun';

/**
 * BalconySunWidget
 *
 * Props:
 *   lat            {number}         Venue latitude
 *   lng            {number}         Venue longitude
 *   balconyFacing  {string|number}  'N' | 'NE' | 'W' | 270 etc.
 *   date           {Date}           Date to calculate for (default: today)
 *   venueName      {string}         Optional venue name for subtitle
 *   compact        {boolean}        If true, render a single-line compact version
 */
export default function BalconySunWidget({
  lat,
  lng,
  balconyFacing = null,
  date,
  venueName,
  compact = false,
}) {
  const calcDate = date instanceof Date ? date : new Date();

  const { totalSunHours, peakWindow, balconyFacingLabel } = useMemo(
    () => calculateBalconySun(lat, lng, calcDate, balconyFacing),
    [lat, lng, balconyFacing, calcDate.toDateString()],
  );

  const hasSun    = totalSunHours > 0;
  const sunEmoji  = hasSun ? '\u2600\ufe0f' : '\u2601\ufe0f';
  const accentCol = hasSun ? '#D97706' : '#64748B';
  const bgColor   = hasSun ? 'rgba(245,158,11,0.08)' : 'rgba(100,116,139,0.07)';
  const border    = hasSun ? '1px solid rgba(245,158,11,0.28)' : '1px solid rgba(100,116,139,0.20)';

  // ── Compact single-line variant ──────────────────────────────
  if (compact) {
    return (
      <div
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 999,
          background: bgColor, border,
        }}
      >
        <span style={{ fontSize: 14 }}>{sunEmoji}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accentCol }}>
          {hasSun
            ? `${totalSunHours}h direct sun${peakWindow ? ` \u00b7 ${peakWindow}` : ''}`
            : 'No direct sun today'}
        </span>
        {balconyFacing && (
          <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>
            \u00b7 Faces {balconyFacingLabel}
          </span>
        )}
      </div>
    );
  }

  // ── Full card variant ───────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      style={{
        borderRadius: 20,
        background: bgColor,
        border,
        boxShadow: hasSun ? '0 0 32px rgba(245,158,11,0.10)' : 'none',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* ── Hero row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <motion.span
          style={{ fontSize: 28, lineHeight: 1 }}
          animate={hasSun ? { rotate: [-4, 4, -3, 3, 0], scale: [1, 1.12, 0.96, 1.08, 1] } : {}}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {sunEmoji}
        </motion.span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: accentCol,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {hasSun
              ? `${totalSunHours} hour${totalSunHours !== 1 ? 's' : ''} direct sun`
              : 'No direct sun today'}
          </span>
          {hasSun && peakWindow && (
            <span style={{ fontSize: 14, fontWeight: 700, color: '#92400E' }}>
              {peakWindow}
            </span>
          )}
        </div>

        {/* Live badge */}
        {hasSun && (
          <motion.span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '3px 9px',
              borderRadius: 999,
              background: '#F59E0B',
              color: '#fff',
              flexShrink: 0,
            }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            TODAY
          </motion.span>
        )}
      </div>

      {/* ── Meta row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          paddingTop: 8,
          borderTop: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {balconyFacing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13 }}>\ud83e\udded</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
              Balcony faces {balconyFacingLabel}
            </span>
          </div>
        )}
        {!hasSun && (
          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
            Try a {balconyFacing ? 'north or west' : 'sunnier'} facing room for afternoon sun
          </span>
        )}
        {venueName && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: '#94A3B8',
              fontStyle: 'italic',
              flexShrink: 0,
            }}
          >
            {venueName}
          </span>
        )}
      </div>
    </motion.div>
  );
}
