import React from 'react';
import { motion } from 'framer-motion';
import BalconySunWidget from './BalconySunWidget';

// ── Helpers used only within this file ──────────────────────────
const ACCOMMODATION_KEYWORDS = [
  'hotel', 'airbnb', 'apartment', 'loft', 'penthouse',
  'suite', 'villa', 'resort', 'motel', 'hostel', 'bnb',
  'bed and breakfast', 'serviced', 'boutique hotel',
  'accommodation', 'stay', 'lodge', 'inn', 'townhouse',
  'studio', 'warehouse loft',
];

function isAccommodation(venue) {
  if (!venue) return false;
  const typeStr = (venue.type || '').toLowerCase();
  const vibeStr = (Array.isArray(venue.vibe) ? venue.vibe.join(' ') : (venue.vibe || '')).toLowerCase();
  return (
    typeStr.length > 0 ||
    ACCOMMODATION_KEYWORDS.some(kw => vibeStr.includes(kw) || typeStr.includes(kw))
  );
}

// ── Sub-components ─────────────────────────────────────────
const GoldenWindowBar = ({ sunData }) => {
  if (!sunData || typeof sunData.startHour !== 'number') return null;
  const START = 6, END = 21, TOTAL = END - START;
  const clampedStart = Math.max(START, sunData.startHour);
  const clampedEnd   = Math.min(END,   sunData.endHour);
  const left  = ((clampedStart - START) / TOTAL) * 100;
  const width = ((clampedEnd - clampedStart) / TOTAL) * 100;
  const hours = Math.round(clampedEnd - clampedStart);
  const now   = new Date();
  const nowPct = Math.max(0, Math.min(100, ((now.getHours() + now.getMinutes() / 60) - START) / TOTAL * 100));
  const labels = [6, 9, 12, 15, 18, 21];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-amber-500 text-[0.7rem] font-black uppercase tracking-widest flex items-center gap-1.5">
          <motion.span
            animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-block' }}
          >☀️</motion.span>
          Golden Window
        </span>
        <motion.span
          className="text-amber-600 text-[11px] font-black"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        >
          {hours}h direct sun today
        </motion.span>
      </div>
      <div className="relative h-[24px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
        <motion.div
          className="absolute h-full rounded-full"
          style={{ left: `${left}%`, background: 'linear-gradient(90deg, #F59E0B, #FDE68A, #F97316)', boxShadow: '0 0 16px rgba(245,158,11,0.5), 0 0 40px rgba(245,158,11,0.15)' }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: `${width}%`, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        />
        <motion.div
          className="absolute top-0 h-full w-12 rounded-full"
          style={{ left: `${left}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
          animate={{ x: ['0%', `${width * 4}px`, '0%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
        <motion.div
          className="absolute top-0 h-full w-0.5 rounded-full"
          style={{ left: `${nowPct}%`, background: 'rgba(30,41,59,0.5)' }}
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="flex justify-between px-0.5">
        {labels.map(h => (
          <span key={h} style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
            {h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
          </span>
        ))}
      </div>
    </div>
  );
};

// ── Main export ──────────────────────────────────────────────
export default function VenueCardSun({
  sunData,
  sunHours,
  burnTimeMins,
  hourlyData,
  displaySunrise,
  displaySunset,
  sunshineMins,
  daylightHours,
  // New props for balcony widget
  venue,
}) {
  if (!hourlyData) return null;

  // Only show BalconySunWidget for hotel/apartment venues that have balcony_facing data
  const showBalconyWidget =
    isAccommodation(venue) &&
    venue?.balcony_facing != null &&
    Number.isFinite(Number(venue?.lat)) &&
    Number.isFinite(Number(venue?.lng));

  return (
    <motion.div
      className="rounded-2xl p-3"
      style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
    >
      {/* Golden Window bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <GoldenWindowBar sunData={sunData} />
        {burnTimeMins !== null && burnTimeMins < 60 && (
          <span className="font-medium text-[11px] ml-1 tracking-wide" style={{ color: '#EF4444' }}>
            ⚠️ Burn time: {burnTimeMins} mins
          </span>
        )}
      </div>

      {/* Sunrise / Sunset / Sun hours meta row */}
      <div className="flex gap-5 mt-3 pt-3 flex-wrap" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#94A3B8' }}>Sunrise</span>
          <span className="font-black text-sm text-amber-500">{displaySunrise}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#94A3B8' }}>Sunset</span>
          <span className="font-black text-sm text-orange-500">{displaySunset}</span>
        </div>
        <div className="flex flex-col ml-auto items-end">
          <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#94A3B8' }}>{sunHours.labels.outdoor}</span>
          <span className="font-black text-sm" style={{ color: '#1E293B' }}>{sunHours.outdoor}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#94A3B8' }}>{sunHours.labels.covered}</span>
          <span className="font-black text-sm" style={{ color: '#1E293B' }}>{sunHours.covered}</span>
        </div>
        {sunshineMins !== null && (
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#94A3B8' }}>Sunshine</span>
            <span className="font-black text-sm text-amber-500">{sunshineMins}m</span>
          </div>
        )}
        {daylightHours !== null && (
          <div className="flex flex-col items-end">
            <span className="text-[8px] uppercase tracking-widest font-black" style={{ color: '#94A3B8' }}>Daylight</span>
            <span className="font-black text-sm" style={{ color: '#1E293B' }}>{daylightHours}h</span>
          </div>
        )}
      </div>

      {/* ─── BalconySunWidget — hotel/apartment only, requires balcony_facing ─── */}
      {showBalconyWidget && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(245,158,11,0.14)' }}>
          <BalconySunWidget
            lat={Number(venue.lat)}
            lng={Number(venue.lng)}
            balconyFacing={venue.balcony_facing}
            date={new Date()}
            venueName={venue.name}
          />
        </div>
      )}
    </motion.div>
  );
}
