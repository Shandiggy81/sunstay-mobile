import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FEATURE_BADGES } from '../config/features';

const Float = ({ children, delay = 0, range = 6, duration = 4, className = '' }) => (
  <motion.div
    className={className}
    animate={{ y: [0, -range, 0] }}
    transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
  >
    {children}
  </motion.div>
);

export default function VenueCardActions({
  verdict,
  safeTags,
  safeVibes,
  isRainStartingSoon,
  minutesUntilRain,
  liveFeaturesForVenue,
  heating,
  actualHappyHour,
  isHotelOrStay,
  cozyWeatherActive,
  setShowOwnerDashboard,
  setSelectedVenue,
  venue,
}) {
  function isHappyHourNow(happyHour) {
    if (!happyHour) return false;
    const now = new Date();
    const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
    if (!Array.isArray(happyHour.days) || !happyHour.days.includes(day)) return false;
    if (!happyHour.start || !happyHour.end) return false;
    const [sh, sm] = String(happyHour.start).split(':').map(Number);
    const [eh, em] = String(happyHour.end).split(':').map(Number);
    if (![sh, sm, eh, em].every(Number.isFinite)) return false;
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= sh * 60 + sm && mins < eh * 60 + em;
  }

  return (
    <>
      <motion.div
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-bold uppercase tracking-widest text-[14px] text-slate-900">How's the Vibe? ✨</span>
            <span className="font-medium text-[12px] text-slate-600">{verdict.icon} {verdict.text}</span>
          </div>
          {/* Single swipe row — scrollbar-hide maps to the custom utility in src/index.css */}
          <div className="flex gap-2 flex-nowrap overflow-x-auto scrollbar-hide pb-1">
            {(safeTags.length ? safeTags : safeVibes.length ? safeVibes : ['Chill']).map((t, i) => (
              <span key={i} className="font-semibold uppercase whitespace-nowrap text-[11px] tracking-wide px-3.5 py-2 rounded-full bg-slate-50 border border-slate-200 text-slate-700">{t}</span>
            ))}
          </div>
          {/* PRIMARY CTA — Capture the Vibe (amber accent) */}
          <motion.label
            className="flex items-center justify-center gap-2 w-full rounded-2xl cursor-pointer"
            style={{ minHeight: '54px', background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 4px 20px rgba(245,158,11,0.25)' }}
            whileTap={{ scale: 0.97 }}
          >
            <motion.span className="font-black" style={{ fontSize: '15px', color: '#FFFFFF' }} animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}>📸 Capture the Vibe</motion.span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={() => {}} />
          </motion.label>
        </div>
      </motion.div>

      {/* TERTIARY owner link — borderless underline, opacity-60, clearly below primary workflow */}
      {setShowOwnerDashboard && (
        <motion.button
          onClick={() => { setShowOwnerDashboard(true); setSelectedVenue(venue); }}
          className="mt-2.5 mb-1 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border-none bg-transparent text-[11px] font-medium tracking-[0.03em] text-slate-500 underline underline-offset-2 transition-colors hover:text-slate-700 active:bg-slate-900/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          whileTap={{ scale: 0.98 }}
        >
          ⚙️ Manage this partner venue
        </motion.button>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 24 }}
        className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-2"
      >
        <Float range={3} duration={3} delay={0}><span className="text-xl">{verdict.icon}</span></Float>
        <span className="font-black text-[0.75rem]" style={{ color: verdict.color }}>{verdict.text}</span>
      </motion.div>

      {isRainStartingSoon && minutesUntilRain > 0 && (
        <div className="w-full bg-white rounded-full border border-amber-200 shadow-sm py-2 px-4 mb-4 flex items-center justify-center">
          <span className="font-semibold text-sm text-amber-600">⚠️ Rain expected in {minutesUntilRain} mins</span>
        </div>
      )}

      {(liveFeaturesForVenue?.fireplaceOn || liveFeaturesForVenue?.heatersOn) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 bg-white rounded-2xl border border-amber-200 shadow-sm px-3 py-2"
          style={{ boxShadow: '0 0 24px rgba(245,158,11,0.10)' }}
        >
          <motion.span className="text-xl" animate={{ scale: [1, 1.2, 0.95, 1.15, 1], rotate: [-4, 4, -3, 3, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>🔥</motion.span>
          <span className="font-black text-sm" style={{ color: '#B45309' }}>
            {liveFeaturesForVenue?.fireplaceOn ? 'Fireplace Active — On Now' : 'Outdoor Heaters — On Now'}
          </span>
        </motion.div>
      )}

      {heating && !['no heating','indoor only','heated outdoor'].includes(heating) && (
        <Float range={4} duration={4} delay={0.1}>
          <div className="flex items-center gap-2 bg-white rounded-2xl border border-amber-200 shadow-sm px-3 py-2">
            <motion.span className="text-xl" animate={{ scale: [1, 1.15, 0.95, 1.1, 1], rotate: [-3, 3, -2, 2, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>🔥</motion.span>
            <span className="text-sm font-black" style={{ color: '#D97706' }}>
              {heating === 'electric-fireplace' ? 'Premium Electric Fireplace' : heating === 'traditional-fireplace' ? 'Traditional Gas Fireplace' : 'Fireplace Active'}
            </span>
          </div>
        </Float>
      )}

      {actualHappyHour && !isHotelOrStay && (
        <Float range={3} duration={6} delay={0.4}>
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-2">
            <div>
              <span className="text-amber-600 text-[11px] font-semibold uppercase tracking-widest block mb-0.5">🍻 Happy Hour · {actualHappyHour.start} – {actualHappyHour.end}</span>
              <span className="font-bold text-[15px] text-slate-900">{actualHappyHour.deal}</span>
            </div>
            {isHappyHourNow(actualHappyHour) && (
              <motion.span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ml-3 flex-shrink-0 bg-amber-500 text-white" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>LIVE</motion.span>
            )}
          </div>
        </Float>
      )}

      {liveFeaturesForVenue && Object.values(liveFeaturesForVenue).some(Boolean) && (
        <div className="flex flex-wrap gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          {Object.entries(liveFeaturesForVenue).map(([key, active], i) =>
            active && FEATURE_BADGES[key] ? (
              <Float key={key} range={2} duration={4 + i * 0.3} delay={i * 0.05}>
                <span className="text-[11px] font-semibold uppercase px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700">{FEATURE_BADGES[key]}</span>
              </Float>
            ) : null
          )}
        </div>
      )}

      {cozyWeatherActive && (
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-2">
          <Float range={4} duration={4}><span>☕</span></Float>
          <span className="text-sm font-bold text-slate-700">Cozy Indoor · Heaters · Shelter</span>
        </div>
      )}
    </>
  );
}
